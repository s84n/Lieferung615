# Lieferung615

Ein kleines isometrisches Liefer-Arcade für den Browser, gebaut mit [three.js](https://threejs.org/).

Du fährst einen Lieferwagen durch eine Miniaturstadt, holst Ware im Lager ab und bringst sie zu den Kunden, bevor der Feierabend kommt. Eine Runde dauert drei Minuten.

## Features

- Prozedurale Miniaturstadt im Tilt-Shift-Look mit Schatten, Ambient Occlusion und dezentem Bloom
- Tageslauf von Sonnenaufgang bis Sonnenuntergang während einer Runde
- Arcade-Fahrphysik mit 5-Gang-Getriebe, Drift und synthetisiertem Motorsound
- Aufträge mit Notfällen, zerbrechlicher und sperriger Ware sowie Bonus für sauberes Andocken
- Verkehr, wechselnde Straßensperren, Leitkegel und Power-Ups
- Tages-Tour: Alle Spieler eines Tages fahren dieselbe Auftragsfolge
- Lokale Bestenliste mit Rängen, Einstellungsmenü für Musik, Effekte und Grafik

## Steuerung

| Taste | Aktion |
| --- | --- |
| `W` `A` `S` `D` / Pfeiltasten | Fahren |
| `Leertaste` | Handbremse / Drift |
| `H` | Hupe |
| `O` | Einstellungen |
| `M` | Ton an/aus |
| `F` | Vollbild |
| `Enter` | Start / Bestätigen |
| `Esc` | Zurück zum Titel |

## Entwicklung

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal ansehen
```

URL-Parameter:

- `?q=low` – schnellere Grafikstufe für schwächere Geräte
- `?seed=1234` – feste Tour statt der Tages-Tour
- `?debug` – FPS-Anzeige

## Deployment

Jeder Push auf `main` baut das Spiel per GitHub Actions und veröffentlicht es auf GitHub Pages.

## Technik

- [three.js](https://threejs.org/) für Rendering und Postprocessing
- [Vite](https://vitejs.dev/) als Build-Tool
- Web Audio API für Motor- und Effektsounds
- Schrift: [Exo 2](https://fonts.google.com/specimen/Exo+2) (SIL Open Font License), lokal eingebunden
