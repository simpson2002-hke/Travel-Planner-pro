@import "tailwindcss";

:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #020617;
  color-scheme: dark;
  font-size: 17px;
}

:root[data-theme="light"] {
  background: #cdd0d8;
  color-scheme: light;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }

body {
  margin: 0;
  min-width: 320px;
  background: #020617;
  color: #ffffff;
  transition: background-color 250ms ease, color 250ms ease;
}
:root[data-theme="light"] body {
  background: #cdd0d8;
  color: #0f172a;
}

button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
#root { min-height: 100vh; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(100,100,120,.35); border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: rgba(100,100,120,.55); }

input[type="color"] { padding: 2px 4px; border-radius: 8px; }

/* hero crossfade */
.hero-bg { position: absolute; inset: 0; background-size: cover; background-position: center; transition: opacity 1.2s ease; }

/* file input */
.file-label {
  display: inline-flex; align-items: center; gap: .5rem;
  cursor: pointer; border-radius: 9999px; padding: .5rem 1rem;
  font-size: .8125rem; font-weight: 500; transition: background .15s;
}
.file-label input[type="file"] { display: none; }

/* note attachment thumbnail */
.att-thumb {
  width: 80px; height: 80px; object-fit: cover; border-radius: 12px;
  cursor: pointer; transition: transform .15s;
}
.att-thumb:hover { transform: scale(1.08); }
