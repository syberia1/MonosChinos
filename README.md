# MonosChinos para Kino

Plugin de Kino (apiVersion 6) para [MonosChinos](https://monoschinos.st): busca anime subtitulado al español, muestra su catálogo, abre cada serie o película y la reproduce desde los servidores que usa el sitio. Misma arquitectura que el plugin de TioAnime: copias guardadas de cada fila del inicio, TMDB para carátulas, fondos e imágenes de capítulos, y servidores múltiples.

## Qué hace

| Función de Kino | Qué hace este plugin |
| --- | --- |
| **Buscar** | `/buscar?q=`, con carátula y fondo de TMDB. |
| **Inicio** | **En emisión** (los animes de "Últimos capítulos" de la portada), **Animes** (catálogo) y **Películas**. |
| **Ver más** | En emisión → `/emision?p=N` (animes de estreno de la temporada); Animes → `/animes?p=N`; Películas → el filtro de tipo Película del catálogo. |
| **Ficha** | Título, sinopsis, año, carátula y fondo de TMDB, y lista de capítulos con título, imagen, resumen, fecha y duración de TMDB. |
| **Película** | Un solo botón de reproducir (capítulo 1 del sitio). |
| **Reproducir / Descargar** | Voe, MixDrop, Mp4Upload, LuluStream, SaveFiles, Doodstream, Filemoon y otros; el que no elijas queda en el menú Servidor. |

## Qué cambió en la 3.5.0

- **Carátulas y fondos desde TMDB**, no desde AniList ni Kitsu (se quitaron del código y de los hosts). La imagen propia del sitio solo se usa si TMDB no tiene una coincidencia segura.
- **Imágenes de capítulos desde TMDB.** Las del sitio y la carátula de relleno ya no se usan: si TMDB no tiene el capítulo, queda sin imagen y Kino pone la suya.
- **En emisión = "Últimos capítulos".** Se leen los capítulos de la portada, se agrupan por anime y se muestran en su orden.
- **Películas de vuelta.** Antes la fila se saltaba por tiempo: las filas se cargaban una tras otra y la tercera ya no cabía en los 20 segundos de Kino. Ahora se cargan en paralelo, con copia guardada y tiempo máximo por fila.
- **"Ver más" corregido.** El sitio pagina con `?p=N`; el plugin usaba `page=N` y repetía siempre la primera página.
- **Películas con su propia ficha.** Una película usa como ref el capítulo 1; antes usaba la ref de serie y al abrirla no se podía reproducir.

## Cómo funciona

### Inicio y copias guardadas

El inicio trabaja con un presupuesto de 17 segundos y guarda cada fila al llegar:

| Copia guardada | Qué hace |
| --- | --- |
| Menos de 10 minutos | La usa tal cual, sin pedir nada al sitio (instantáneo) |
| Hasta 1 hora | Intenta refrescar 2,5 segundos; si el sitio no alcanza, muestra la copia |
| Hasta 6 horas | Intenta refrescar 6 segundos |
| Más vieja (hasta 12 horas) | Intenta refrescar 12 segundos |
| Ninguna (primera vez) | Espera al sitio, dentro del presupuesto |

### TMDB

- **Listas** (inicio, búsqueda, ver más): carátula, fondo y resumen. Lo guardado se aplica siempre; las consultas nuevas son hasta 14 o 16 por apertura (TMDB limita a unas 20 cada 10 segundos por plugin) y se guardan 14 días. Un inicio recién instalado se completa en dos o tres aperturas.
- **Qué serie de TMDB se acepta:** solo japonesas (de animación si las hay). Con año conocido (el catálogo lo muestra) manda el año; sin año se exige que el nombre comparta al menos el 60 % de las palabras del título. Los sufijos "Temporada 2", "S3", "2nd Season", "II" o un número final se tratan como temporada. Si nada es seguro, no se usa TMDB.
- **Ficha:** título, resumen, imagen, fecha y duración de cada capítulo (6 horas de caché). Si el sitio numera sin temporadas (capítulo 527 de una serie larga), se convierte a la numeración de TMDB sumando las temporadas.

### Películas

El catálogo se filtra con botones, y la URL del filtro "Película" no es fija. El plugin la busca en la página `/animes` (un enlace, un `<select>` o un dato `data-*` con el valor "pelicula"), prueba los nombres de parámetro más comunes (`tipo`, `categoria`, `type`, `tipos`) y **solo acepta una URL cuyas tarjetas sean de tipo Película** (al menos el 60 %). La URL que funciona se guarda 30 días. Si ninguna sirve, la fila se arma con búsquedas ("movie", "pelicula") quedándose con las de tipo Película.

### Capítulos y servidores

Sin cambios respecto a la 3.4.0: la ficha trae un `data-ajax` con el listado (paginado, ahora en paralelo) y cada capítulo trae sus servidores en `data-player` (URL en base64). Mega se ignora (va cifrado).

## Instalación

1. Cambia `author` en `kino-plugin.json`.
2. Sube `kino-plugin.json`, `plugin.js` y este README a un repositorio público de GitHub.
3. En Kino: **Ajustes ▸ Plugins** y escribe `usuario/repositorio`.
4. Abre el inicio varias veces seguidas la primera vez: las carátulas y los fondos de TMDB se completan de a poco.

## Caché

| Clave | Contenido | Duración |
| --- | --- | --- |
| `row3:<fila>` | Última copia buena de cada fila del inicio | 12 horas |
| `tm2:<slug>` | Carátula, fondo, resumen y año de TMDB (`0` si no hubo) | 14 días (1 día si no hubo) |
| `tmdb3:<slug>` | Títulos, imágenes y resúmenes de capítulos | 6 horas |
| `pm:<slug>` | Carátula del propio sitio (respaldo) | 14 días |
| `yr1:<slug>` | Año visto en el catálogo | 30 días |
| `mv1:url` | URL del filtro de películas | 30 días (6 horas si no se encontró) |

## Qué revisar si algo falla

Activa **Modo debug** en la pestaña del plugin; el registro dice qué fila o paso falló.

| Síntoma | Dónde mirar |
| --- | --- |
| En emisión vacía | `latestCards()`: busca el bloque entre "Últimos capítulos" y "Series recientes" y enlaces `/ver/<slug>-episodio-N` |
| Películas vacías | El registro dice qué URLs probó (`peliculas? … -> N tarjetas`); `moviesFilterCandidates()` |
| Sin carátulas o fondos | TMDB no encontró una coincidencia segura (`pickShow()`), o aún falta completar (abre el inicio otra vez) |
| Capítulos sin imagen | TMDB no tiene esa serie o su numeración no coincide; el registro muestra cuántos capítulos tuvieron imagen |
| Ver más repite la primera página | Parámetro de página: `?p=N` |

## Límites conocidos

- **Parte del HTML no se pudo comprobar desde fuera:** el formato exacto de las tarjetas de "Últimos capítulos" y el filtro de películas se escribieron según lo visible en las páginas y el código anterior; el plugin los verifica en ejecución y deja el motivo en el registro.
- **Cloudflare:** el sitio puede bloquear el cargador de imágenes de Kino (por eso las carátulas salen de TMDB). Las imágenes propias del sitio son solo respaldo.
- **Dominio:** el activo es `monoschinos.st`. Si cambia, actualiza `BASE` y `hosts`.
- **Sin Mega.**

## Créditos y aviso legal

MonosChinos ofrece el catálogo; los videos están en servidores externos. TMDB aporta carátulas, fondos, resúmenes e imágenes de capítulos; este plugin no está respaldado por TMDB. Es un intermediario: no aloja videos. Úsalo solo con contenido al que tengas derecho según tu país.
