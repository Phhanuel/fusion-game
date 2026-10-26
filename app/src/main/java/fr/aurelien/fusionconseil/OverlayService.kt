package fr.aurelien.fusionconseil

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.provider.MediaStore
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/**
 * Service au premier plan :
 *  - capture l'écran (MediaProjection) en demi-résolution, environ 6 images par seconde ;
 *  - affiche par-dessus le jeu une petite fenêtre contenant la page Fusion Conseil (WebView) ;
 *  - la page récupère la dernière image sur https://appassets.androidplatform.net/frame/latest.jpg
 *    et fait tout le reste (lecture du plateau, point blanc, solveur), comme la version PC.
 */
class OverlayService : Service() {

    private lateinit var wm: WindowManager
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var thread: HandlerThread? = null

    private var root: LinearLayout? = null
    private var web: WebView? = null
    private lateinit var params: WindowManager.LayoutParams
    private var compactW = 0
    private var compactH = 0
    private var savedX = 0
    private var savedY = 0
    private var collapsed = false

    @Volatile private var latestJpeg: ByteArray? = null
    @Volatile private var lastFrameAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Android 14 : le service doit être au premier plan AVANT d'obtenir la capture
        startInForeground()
        if (projection == null && intent != null) {
            val code = intent.getIntExtra(EXTRA_CODE, 0)
            @Suppress("DEPRECATION")
            val data: Intent? = if (Build.VERSION.SDK_INT >= 33)
                intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
            else intent.getParcelableExtra(EXTRA_DATA)
            if (data == null) { stopSelf(); return START_NOT_STICKY }
            val mpm = getSystemService(MediaProjectionManager::class.java)
            projection = mpm.getMediaProjection(code, data)
            startCapture()
            showOverlay()
        }
        return START_NOT_STICKY
    }

    private fun startInForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Fusion Conseil", NotificationManager.IMPORTANCE_LOW)
        )
        val notif = Notification.Builder(this, CHANNEL)
            .setContentTitle("Fusion Conseil")
            .setContentText("Lecture de l'écran du jeu en cours")
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29)
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(NOTIF_ID, notif)
    }

    // ---------- capture de l'écran ----------
    @SuppressLint("WrongConstant")
    private fun startCapture() {
        val proj = projection ?: return
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
        // demi-résolution : assez pour lire les tuiles, beaucoup plus léger
        val w = metrics.widthPixels / 2
        val h = metrics.heightPixels / 2
        val ht = HandlerThread("capture").also { it.start() }
        thread = ht
        val handler = Handler(ht.looper)
        proj.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() { Handler(Looper.getMainLooper()).post { stopSelf() } }
        }, handler)
        val r = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
        reader = r
        r.setOnImageAvailableListener({ ir ->
            val img = ir.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                val now = System.currentTimeMillis()
                if (now - lastFrameAt < 150) return@setOnImageAvailableListener
                lastFrameAt = now
                val plane = img.planes[0]
                val rowPx = plane.rowStride / plane.pixelStride
                val bmp = Bitmap.createBitmap(rowPx, img.height, Bitmap.Config.ARGB_8888)
                bmp.copyPixelsFromBuffer(plane.buffer)
                val crop = if (rowPx != img.width) Bitmap.createBitmap(bmp, 0, 0, img.width, img.height) else bmp
                val out = ByteArrayOutputStream(120_000)
                crop.compress(Bitmap.CompressFormat.JPEG, 88, out)
                latestJpeg = out.toByteArray()
                if (crop !== bmp) crop.recycle()
                bmp.recycle()
            } finally {
                img.close()
            }
        }, handler)
        display = proj.createVirtualDisplay(
            "fusion-conseil", w, h, metrics.densityDpi / 2,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler
        )
    }

    // ---------- fenêtre par-dessus le jeu ----------
    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    private fun showOverlay() {
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val d = resources.displayMetrics.density
        compactW = (360 * d).toInt().coerceAtMost(resources.displayMetrics.widthPixels)
        compactH = (230 * d).toInt()

        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(0x1a, 0x13, 0x10))
        }
        // barre du haut : glisser pour déplacer, réduire, arrêter
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.rgb(0x3d, 0x2f, 0x26))
        }
        val barH = (28 * d).toInt()
        val handle = TextView(this).apply {
            text = "  ⠿  Fusion Conseil"
            setTextColor(Color.rgb(0xf1, 0xe6, 0xd2))
            textSize = 13f
            gravity = Gravity.CENTER_VERTICAL
        }
        val collapse = TextView(this).apply {
            text = "  —  "
            setTextColor(Color.rgb(0xf2, 0xb6, 0x32))
            textSize = 16f
            gravity = Gravity.CENTER
            setOnClickListener { toggleCollapse() }
        }
        val close = TextView(this).apply {
            text = "  ✕  "
            setTextColor(Color.rgb(0xe8, 0x66, 0x4a))
            textSize = 16f
            gravity = Gravity.CENTER
            setOnClickListener { stopSelf() }
        }
        bar.addView(handle, LinearLayout.LayoutParams(0, barH, 1f))
        bar.addView(collapse, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, barH))
        bar.addView(close, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, barH))

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/frame/") { _ ->
                val jpeg = latestJpeg
                if (jpeg == null) WebResourceResponse("image/jpeg", null, 204, "No Content", mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(ByteArray(0)))
                else WebResourceResponse("image/jpeg", null, 200, "OK", mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(jpeg))
            }
            .build()
        val wv = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            setBackgroundColor(Color.rgb(0x1a, 0x13, 0x10))
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                    loader.shouldInterceptRequest(request.url)
            }
            addJavascriptInterface(Bridge(), "Android")
            loadUrl("https://appassets.androidplatform.net/assets/fusion_conseil.html")
        }
        web = wv
        box.addView(bar, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, barH))
        box.addView(wv, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        root = box

        params = WindowManager.LayoutParams(
            compactW, compactH,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (resources.displayMetrics.widthPixels - compactW) / 2
            y = (24 * d).toInt()
        }
        wm.addView(box, params)

        // déplacement en faisant glisser la barre
        var downX = 0f; var downY = 0f; var startX = 0; var startY = 0
        handle.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; startX = params.x; startY = params.y; true }
                MotionEvent.ACTION_MOVE -> {
                    params.x = startX + (e.rawX - downX).toInt()
                    params.y = startY + (e.rawY - downY).toInt()
                    wm.updateViewLayout(box, params); true
                }
                else -> true
            }
        }
    }

    private fun toggleCollapse() {
        val wv = web ?: return
        collapsed = !collapsed
        wv.visibility = if (collapsed) View.GONE else View.VISIBLE
        params.height = if (collapsed) (28 * resources.displayMetrics.density).toInt() else compactH
        root?.let { wm.updateViewLayout(it, params) }
    }

    /** Fonctions appelées depuis la page (window.Android). */
    inner class Bridge {
        @JavascriptInterface
        fun setFullscreen(full: Boolean) {
            Handler(Looper.getMainLooper()).post {
                val box = root ?: return@post
                if (full) {
                    savedX = params.x; savedY = params.y
                    params.x = 0; params.y = 0
                    params.width = WindowManager.LayoutParams.MATCH_PARENT
                    params.height = WindowManager.LayoutParams.MATCH_PARENT
                } else {
                    params.x = savedX; params.y = savedY
                    params.width = compactW
                    params.height = compactH
                }
                web?.visibility = View.VISIBLE
                collapsed = false
                wm.updateViewLayout(box, params)
            }
        }

        @JavascriptInterface
        fun saveExport(name: String, content: String) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                if (Build.VERSION.SDK_INT >= 29) put(MediaStore.MediaColumns.RELATIVE_PATH, "Download")
            }
            val uri = if (Build.VERSION.SDK_INT >= 29)
                contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            else null
            if (uri == null) throw IllegalStateException("Android 10 ou plus requis pour l'export")
            contentResolver.openOutputStream(uri)?.use { it.write(content.toByteArray()) }
            Handler(Looper.getMainLooper()).post {
                Toast.makeText(this@OverlayService, "Enregistré dans Téléchargements : $name", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroy() {
        try { root?.let { wm.removeView(it) } } catch (_: Exception) {}
        web?.destroy()
        display?.release()
        reader?.close()
        projection?.stop()
        thread?.quitSafely()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        private const val CHANNEL = "fusion"
        private const val NOTIF_ID = 1
    }
}
