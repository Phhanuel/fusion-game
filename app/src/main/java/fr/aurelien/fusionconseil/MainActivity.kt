package fr.aurelien.fusionconseil

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

/**
 * Écran de lancement : demande les autorisations (affichage par-dessus les autres applis,
 * capture de l'écran) puis démarre le service qui affiche le conseil au-dessus du jeu.
 */
class MainActivity : Activity() {

    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad * 2, pad, pad)
            setBackgroundColor(Color.rgb(0x1a, 0x13, 0x10))
        }
        val title = TextView(this).apply {
            text = "Fusion Conseil"
            textSize = 26f
            setTextColor(Color.rgb(0xf2, 0xb6, 0x32))
        }
        val help = TextView(this).apply {
            text = "1. Touche « Démarrer » et accepte les autorisations.\n" +
                "2. Ouvre le jeu sur la Forge des reliques.\n" +
                "3. Place la fenêtre du conseil en haut de l'écran (fais-la glisser par sa barre), " +
                "hors du plateau et des pièces.\n" +
                "4. Touche ⚙ puis « Calibrer » la première fois.\n\n" +
                "Android redemande l'autorisation de capture à chaque démarrage : c'est imposé par le système."
            textSize = 15f
            setTextColor(Color.rgb(0xf1, 0xe6, 0xd2))
            setPadding(0, pad, 0, pad)
        }
        status = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.rgb(0xa8, 0x93, 0x7a))
            setPadding(0, 0, 0, pad)
        }
        val start = Button(this).apply {
            text = "Démarrer"
            setOnClickListener { startFlow() }
        }
        val stop = Button(this).apply {
            text = "Arrêter"
            setOnClickListener {
                stopService(Intent(this@MainActivity, OverlayService::class.java))
                status.text = "Arrêté."
            }
        }
        root.addView(title)
        root.addView(help)
        root.addView(status)
        root.addView(start)
        root.addView(stop)
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        status.text = if (Settings.canDrawOverlays(this)) "Autorisation d'affichage : accordée."
        else "Autorisation d'affichage par-dessus les autres applis : à accorder."
    }

    private fun startFlow() {
        // 1) affichage par-dessus les autres applis
        if (!Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Active « Fusion Conseil » dans la liste, puis reviens ici.", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            return
        }
        // 2) notifications (Android 13+), nécessaires pour le service au premier plan
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
            return
        }
        // 3) capture de l'écran
        val mpm = getSystemService(MediaProjectionManager::class.java)
        @Suppress("DEPRECATION")
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_NOTIF) startFlow()
    }

    @Deprecated("API Activity simple, sans dépendance AndroidX")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_CAPTURE) return
        if (resultCode != RESULT_OK || data == null) {
            status.text = "Capture refusée : le conseil a besoin de voir l'écran du jeu."
            return
        }
        val intent = Intent(this, OverlayService::class.java)
            .putExtra(OverlayService.EXTRA_CODE, resultCode)
            .putExtra(OverlayService.EXTRA_DATA, data)
        startForegroundService(intent)
        status.text = "Conseil démarré. Tu peux ouvrir le jeu."
        moveTaskToBack(true)
    }

    companion object {
        private const val REQ_CAPTURE = 1
        private const val REQ_NOTIF = 2
    }
}
