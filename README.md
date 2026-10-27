# Absenzen visualisieren

Ein Bookmarklet, das die Absenzenseite einer Schülerin oder eines Schülers in
Schulnetz als Kalenderübersicht darstellt: farbige Balken über die gesamte
Absenzperiode, die betroffenen Lektionen im Tagesraster, eine Lektionen­statistik
und die Prüfungstermine der Klasse.

Es läuft vollständig im Browser. Gelesen wird die Seite, die gerade offen ist;
die einzige Netzwerkanfrage geht an den Schulnetz-Server selbst. Es werden keine
Daten an Dritte übertragen und nichts dauerhaft gespeichert.

## Installation

Installationsseite im Browser öffnen und den Button in die Lesezeichenleiste
ziehen. Danach auf der Absenzenseite eines Schülers das Lesezeichen anklicken;
ein zweiter Klick schliesst die Ansicht.

| Fassung | Seite | Prüfungstermine |
| --- | --- | --- |
| **V2** (empfohlen) | `index.html` | holt das Bookmarklet selbst nach |
| V1 | `v1.html` | zuerst die Prüfungsplan-Seite besuchen |

Beide Fassungen sind eigenständig und stören einander nicht. V1 bleibt als
erprobte Fassung unverändert erhalten.

## Dateien

| Datei | Zweck |
| --- | --- |
| `bookmarklet-source.js` / `bookmarklet-v2-source.js` | lesbarer Quelltext, hier wird entwickelt |
| `build.js` / `build-v2.js` | Build: Kommentare entfernen, Syntax prüfen, Link erzeugen |
| `bookmarklet-min.js` / `bookmarklet-v2-min.js` | Zwischenergebnis ohne Kommentare |
| `bookmarklet-embedded.txt` / `bookmarklet-v2-embedded.txt` | fertiger `javascript:`-Link |
| `index.html` / `v1.html` | Installationsseite mit dem eingebetteten Link (V2 / V1) |

## Bauen

```bash
node build-v2.js   # V2
node build.js      # V1
```

Der Build entfernt Kommentare, prüft mit `new Function(...)`, ob der Code noch
parst, und schreibt ihn URL-codiert in den `javascript:`-Link der zugehörigen
Installationsseite. Keine Abhängigkeiten, es genügt Node.

## Anpassung an eine andere Schule

In der Quelldatei stehen oben zwei Stellen, die schulspezifisch sind: das
`LESSON_GRID` mit den Lektionszeiten und `EXAM_PAGEID` mit der Seitennummer des
Prüfungsplans. `EXAM_SPAN` steuert, ob der Kalender das ganze Schuljahr oder nur
den Zeitraum mit Absenzen umfasst.

## Hinweis zum Repository

Keine Screenshots und keine exportierten Daten einchecken — sie enthalten
Schülernamen. Die `.gitignore` blockt Bild-, PDF-, XML- und CSV-Dateien
vorsorglich.
