# MonosChinos para Kino

Plugin para [Kino](https://github.com/kinotvapp/kino-light) (Android, celular y TV) que permite buscar anime subtitulado al español de [MonosChinos](https://monoschinos.st/), ver su catálogo, abrir cada serie y reproducirla desde sus servidores disponibles.

## Instalación

1. En Kino, abre **Ajustes ▸ Plugins**.
2. Escribe la dirección del repositorio: `usuario/monoschinos-kino` (o la URL pública del `kino-plugin.json`).
3. Acepta los hosts que Kino muestre.
4. Opcional: elige el **Servidor preferido** (MixDrop, Mp4Upload, LuluStream, Voe, SaveFiles, Doodstream o Filemoon).

## Qué hace

| Función de Kino | Qué hace este plugin |
| --- | --- |
| **Buscar** | Busca en `/buscar?q=` de MonosChinos. |
| **Inicio** | Filas **En emisión** (últimos capítulos de la portada), **Animes** y **Películas**. |
| **Ver más** | Pagina el catálogo (`/animes`), en emisión y películas. |
| **Ficha** | Título, resumen, carátula, fondo y miniaturas de capítulos desde TMDB (`kino.tmdb` / `kino.meta`) con respaldo de imágenes propias de `monoschinos.st`. |
| **Reproducir** | Abre el capítulo en el servidor preferido y deja el resto en el menú **Servidor**. |
| **Descargar** | Kino guarda el video que entrega el plugin. |

## Estructura del repositorio

```
monoschinos-kino/
├── kino-plugin.json
├── plugin.js
└── README.md
```

## Pruebas

Con el kit de Kino:

```
node sdk/validate.mjs .
node sdk/run.mjs . home
node sdk/run.mjs . search "one piece"
node sdk/run.mjs . episodes a:one-piece-sub-espanol
node sdk/run.mjs . resolve e:one-piece:1
```
