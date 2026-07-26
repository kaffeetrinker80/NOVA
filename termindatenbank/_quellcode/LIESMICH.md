# Quellcode

Dieser Ordner enthält den Quellcode der App (React/TypeScript). Die live ausgelieferte
Version liegt eine Ebene höher direkt in `termindatenbank/`:

    index.html
    assets/app.js
    assets/app.css
    nova_logo.png      (für den Aushang)

Die Dateinamen sind **fest** – bei jedem Update werden genau diese Dateien überschrieben,
es bleiben keine alten Bundles liegen. Damit Browser trotzdem die neue Fassung laden,
trägt `index.html` bei jedem Build eine Versionsnummer ein (`app.js?v=…`).

## Änderungen vornehmen

1. Hier im Quellcode ändern (`src/...`)
2. `npm install` (einmalig), dann `npm run build`
3. Inhalt von `dist/` eine Ebene hoch nach `termindatenbank/` kopieren
4. Hochladen / committen

Am einfachsten: Claude bitten, die Änderung vorzunehmen und eine neue ZIP mit fertig
gebauter Version bereitzustellen.
