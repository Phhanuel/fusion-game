"""Assemble la page autonome fusion_conseil.html à partir de core.js (vision + solveur), ui.html et defaults.json."""
import os, re
here = os.path.dirname(os.path.abspath(__file__))
read = lambda f: open(os.path.join(here, f), encoding='utf-8').read()
ui, core, d = read('ui.html'), read('core.js'), read('defaults.json')
ui = ui.replace("/*CORESRC*/", core).replace("/*CORE*/", core).replace("/*DEFAULTS*/", d)
ui = ui.replace("function onFrame(img){lastImg=img;", "function onFrame(img){const first=!lastImg;lastImg=img;if(first)renderLevels();")
open(os.path.join(here, 'fusion_conseil.html'), 'w', encoding='utf-8').write(ui)
print('fusion_conseil.html', len(ui), 'octets')
