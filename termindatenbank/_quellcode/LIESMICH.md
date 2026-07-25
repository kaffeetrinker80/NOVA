# Quellcode

Dieser Ordner enthält den Quellcode der App (React/TypeScript). Die eigentliche,
live ausgelieferte Version liegt eine Ebene höher direkt in `termindatenbank/`
als fertig gebaute Dateien (`index.html`, `assets/`, `nova_logo.png`) — genau wie
bei den anderen NOVA-Tools, nur eben vorher durch einen Build-Schritt erzeugt.

## Änderungen vornehmen

1. Hier im Quellcode ändern (`src/...`)
2. Bauen: `npm install` (einmalig) dann `npm run build`
3. Den Inhalt des entstehenden `dist/`-Ordners eine Ebene hoch nach
   `termindatenbank/` kopieren (überschreibt `index.html` und `assets/`)
4. Neu hochladen / committen

Am einfachsten: Claude bitten, die Änderung vorzunehmen und eine neue ZIP mit
bereits gebauter Version bereitzustellen.
