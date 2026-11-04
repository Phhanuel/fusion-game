"""Fusion Conseil - mode auto (PC Windows).

Lance un petit serveur local qui :
  - sert la page fusion_conseil.html (placée dans le même dossier) sur http://127.0.0.1:8765
  - joue dans le jeu les coups que la page lui envoie (clics et glisser-déposer à la souris).

Installation (une seule fois) :   py -m pip install pyautogui mss
Lancement :                       py fusion_auto.py
Arrêt d'urgence : amène la souris dans le coin HAUT-GAUCHE de l'écran, ou ferme cette fenêtre.
"""
import ctypes
import ctypes.wintypes as wt
import json
import os
import random
import sys
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# coordonnées en pixels physiques (écrans à 125 %, 150 %…) : doit précéder pyautogui et mss
try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

try:
    import mss
    import pyautogui
except ImportError:
    print("Il manque des modules. Tape dans un terminal :  py -m pip install pyautogui mss")
    input("Entrée pour fermer…")
    sys.exit(1)

PORT = 8765
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "fusion_conseil.html")
pyautogui.FAILSAFE = True   # souris dans le coin haut-gauche = arrêt
pyautogui.PAUSE = 0


def game_window_rect():
    """Partie visible de la fenêtre du jeu (si on a partagé la fenêtre et pas l'écran entier)."""
    user32 = ctypes.windll.user32
    found = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n:
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(hwnd, buf, n + 1)
            if "Endless Frontier" in buf.value:
                found.append(hwnd)
        return True

    user32.EnumWindows(cb, 0)
    for hwnd in found:
        r = wt.RECT()
        # bords visibles (sans l'ombre invisible de Windows 10/11)
        if ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(r), ctypes.sizeof(r)) != 0:
            user32.GetWindowRect(hwnd, ctypes.byref(r))
        return r.left, r.top, r.right - r.left, r.bottom - r.top
    return None


def to_screen(w, h):
    """Fonction image du jeu (w×h) -> écran. Écran entier partagé : même taille qu'un moniteur ; sinon fenêtre du jeu."""
    with mss.mss() as m:
        for mon in m.monitors[1:]:
            if mon["width"] == w and mon["height"] == h:
                print(f"  repère : écran entier {w}x{h} à ({mon['left']},{mon['top']})")
                return lambda x, y: (mon["left"] + x, mon["top"] + y)
    win = game_window_rect()
    if win:
        left, top, ww, hh = win
        sx, sy = ww / w, hh / h
        print(f"  repère : fenêtre du jeu {ww}x{hh} à ({left},{top}), image {w}x{h}, échelle {sx:.3f} x {sy:.3f}")
        return lambda x, y: (left + x * sx, top + y * sy)
    raise RuntimeError("fenêtre du jeu introuvable (partage plutôt l'écran entier)")


def jitter(v, a=3):
    return v + random.uniform(-a, a)


def play(w, h, actions):
    conv = to_screen(w, h)
    for a in actions:
        if a["type"] == "click":
            x, y = conv(jitter(a["x"]), jitter(a["y"]))
            pyautogui.moveTo(x, y, duration=random.uniform(0.12, 0.25))
            pyautogui.click()
            time.sleep(random.uniform(0.35, 0.55))      # animation de rotation
        elif a["type"] == "move":
            x, y = conv(jitter(a["x"], 6), jitter(a["y"], 6))
            pyautogui.moveTo(x, y, duration=random.uniform(0.1, 0.2))
        elif a["type"] == "show":       # test : la souris se pose sur un point, sans cliquer
            x, y = conv(a["x"], a["y"])
            print(f"  test {a.get('label', '')} : image ({a['x']:.0f},{a['y']:.0f}) -> écran ({x:.0f},{y:.0f})")
            pyautogui.moveTo(x, y, duration=0.3)
            time.sleep(1.2)
        elif a["type"] == "drag":
            x1, y1 = conv(jitter(a["x1"], 2), jitter(a["y1"], 2))
            x2, y2 = conv(jitter(a["x2"], 2), jitter(a["y2"], 2))
            print(f"  glisser : ({x1:.0f},{y1:.0f}) -> ({x2:.0f},{y2:.0f}) à l'écran")
            pyautogui.moveTo(x1, y1, duration=random.uniform(0.15, 0.25))
            time.sleep(0.1)
            pyautogui.mouseDown(x1, y1)
            time.sleep(random.uniform(0.2, 0.3))         # le jeu « attrape » la pièce
            # petit décollage, puis trajet lent en 25 étapes : certains jeux ignorent un saut direct
            pyautogui.moveTo(x1 + 4, y1 - 4, duration=0.05)
            steps = 25
            for i in range(1, steps + 1):
                t = i / steps
                pyautogui.moveTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, duration=0.015)
            time.sleep(random.uniform(0.2, 0.3))         # la pièce se cale sur la case
            pyautogui.mouseUp(x2, y2)
            time.sleep(random.uniform(0.9, 1.2))       # fusions et animation


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/ping":
            return self._send(200, "fusion-auto", "text/plain")
        if self.path in ("/", "/index.html", "/fusion_conseil.html"):
            if not os.path.exists(PAGE):
                return self._send(404, "fusion_conseil.html doit être dans le même dossier que fusion_auto.py", "text/plain; charset=utf-8")
            with open(PAGE, "rb") as f:
                return self._send(200, f.read(), "text/html; charset=utf-8")
        self._send(404, "introuvable", "text/plain")

    def do_POST(self):
        if self.path != "/act":
            return self._send(404, "{}")
        try:
            d = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            play(int(d["w"]), int(d["h"]), d["actions"])
            print(time.strftime("%H:%M:%S"), "coup joué :", ", ".join(a["type"] for a in d["actions"]))
            self._send(200, json.dumps({"ok": True}))
        except pyautogui.FailSafeException:
            print("Arrêt d'urgence (souris dans le coin).")
            self._send(200, json.dumps({"ok": False, "err": "arrêt d'urgence (souris dans le coin)"}))
        except Exception as e:
            print("Erreur :", e)
            self._send(200, json.dumps({"ok": False, "err": str(e)}))


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print("Fusion Conseil auto :", url)
    print("Laisse cette fenêtre ouverte. Arrêt d'urgence : souris dans le coin haut-gauche de l'écran.")
    webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
