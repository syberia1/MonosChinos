# MonosChinos para Kino

Plugin para [Kino](https://github.com/kinotvapp/kino-light) (Android, celular y TV) que permite buscar anime subtitulado al español de [MonosChinos2](https://vww.monoschinos2.net/), ver su catálogo, abrir cada serie y reproducirla desde los servidores **Voe** y **YourUpload**.

Basado en la misma arquitectura que el plugin de TioAnime.

## Instalación

1. En Kino, abre **Ajustes ▸ Plugins**.
2. Escribe la dirección del repositorio: `usuario/monoschinos-kino` (o la URL pública del `kino-plugin.json`).
3. Acepta los hosts que Kino muestre.
4. Opcional: elige el **Servidor preferido** (Voe o YourUpload).

## Qué hace

| Función de Kino | Qué hace este plugin |
| --- | --- |
| **Buscar** | Busca en `/animes?buscar=` de MonosChinos2. |
| **Inicio** | Filas **En emisión** (últimos capítulos de la home) y **Animes** (catálogo). |
| **Ver más** | Pagina el catálogo (`/animes`) y el filtro en emisión. |
| **Ficha** | Título, resumen, géneros, fondo (TMDB) y lista de capítulos. |
| **Reproducir** | Abre el capítulo en Voe o YourUpload. |
| **Descargar** | Kino guarda el video que entrega el plugin. |

## Servidores

Los embeds salen de `button.play-video[data-player]` (URL en base64). El plugin detecta y resuelve:

| Servidor | Notas |
| --- | --- |
| **Voe** | JSON ofuscado (ROT13 + base64). |
| **Filemoon** / byse | Packer JS → `file:` m3u8. |
| **StreamWish** | Packer / JWPlayer → m3u8. |
| **Doodstream** | `/pass_md5/` + token. |
| **MixDrop** | Packer → `wurl`. |
| **Mp4Upload** | Packer / `player.src`. |
| **LuluStream** | Packer → m3u8. |
| **Vidhide** (Filelions) | Packer → m3u8. |
| **Uqload** | `sources[].src`. |
| **YourUpload** | `file:` / `og:video` / `<source>`. |
| **Mega** | Cifrado; se ignora y se nombra en el error si es el único. |

Cualquier otro embed con m3u8/mp4 a la vista o empaquetado se intenta con el extractor genérico.

El ajuste **Servidor preferido** decide cuál se intenta primero; el resto queda en el menú **Servidor** del reproductor (copias diferidas).

## Estructura del repositorio

```
monoschinos-kino/
├── kino-plugin.json
├── plugin.js
└── README.md
```

## URLs del sitio

| Página | Uso |
| --- | --- |
| `https://vww.monoschinos2.net/` | Últimos capítulos (En emisión). |
| `https://vww.monoschinos2.net/animes` | Catálogo; `?buscar=`, `?estado=en+emision`, `?pagina=N`. |
| `https://vww.monoschinos2.net/anime/<slug>` | Ficha y lista de `/ver/<slug>-episodio-N`. |
| `https://vww.monoschinos2.net/ver/<slug>-episodio-N` | Servidores en `button.play-video[data-player]` (URL en base64). |

## Límites conocidos

- **Sin Mega.** No se puede descifrar desde el plugin.
- **Dependencia de HTML.** Si el sitio cambia selectores o el formato de `data-player`, hay que ajustar `cardsFrom()`, `listServers()` o `parseAnimePage()`.
- **Dominio.** El host activo es `vww.monoschinos2.net` (también existen variantes `wvv.`, etc.). Si el dominio principal cambia, actualiza `BASE` y `hosts` en el manifiesto.

## Pruebas

Con el kit de Kino:

```
node sdk/validate.mjs .
node sdk/run.mjs . home
node sdk/run.mjs . search "one piece"
node sdk/run.mjs . episodes a:one-piece
node sdk/run.mjs . resolve e:slug:1
```

## Créditos y aviso legal

MonosChinos2 ofrece el catálogo; Voe y YourUpload alojan los videos. Los derechos de cada anime pertenecen a sus autores. Este plugin es un intermediario: no aloja videos. Úsalo solo para contenido al que tengas derecho según tu país.
