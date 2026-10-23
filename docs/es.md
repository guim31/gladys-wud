# What's Up Docker

[What's Up Docker](https://getwud.github.io/wud/) (WUD) es una herramienta
libre y autoalojada que vigila sus contenedores Docker y le avisa cuando se
publica una versión más reciente de su imagen. Esta integración lleva a Gladys
lo que WUD ha encontrado: un dispositivo What's Up Docker (accesible,
contenedores vigilados, actualizaciones disponibles, actualizaciones mayores),
un dispositivo por cada contenedor elegido (actualización disponible, versión
actual, nueva versión), escenas que se inician cuando se encuentra o se aplica
una actualización, y un widget del panel con los contenedores que actualizar.

La integración es **de solo lectura**: nunca actualiza un contenedor ni lanza
ningún «trigger» de WUD. La actualización sigue siendo decisión suya, en WUD o
a mano.

Probada con un WUD 9.5.0 y 8.4.0 reales (Docker, vigilando un demonio Docker
aislado); aún no en todas las instalaciones: sus comentarios son bienvenidos en
[las issues](https://github.com/guim31/gladys-wud/issues).

## Qué necesita

- Gladys Assistant 5.1.0 o posterior.
- What's Up Docker 8 o 9, accesible desde la máquina de Gladys (puerto 3000 por
  defecto).
- Con WUD 9 (la autenticación es obligatoria): un usuario y su contraseña, o
  mejor un token de API. Con WUD 8: el usuario y la contraseña si activó la
  autenticación, nada en caso contrario.

WUD consulta los registros por sí mismo, según su propio calendario (cada hora
por defecto): Gladys solo lee lo que ha encontrado, cada 5 minutos por defecto,
y solo pide una comprobación cuando usted pulsa «Comprobar» o una escena lo
pide.

## Primeros pasos

### 1. Crear un token de API (WUD 9)

En WUD, abra su perfil, luego **API tokens**, y cree un token. El ámbito
**read** basta para seguir las actualizaciones; añada **write** para
«Comprobar». También puede usar un usuario y su contraseña.

### 2. Configurar la integración

En Gladys, abra **Integraciones → What's Up Docker → Configuración**:

- **Dirección de WUD**: la dirección con la que abre WUD, p. ej.
  `http://192.168.1.2:3000`.
- **Usuario** y **Contraseña**, o **Token de API (WUD 9)**: el token tiene
  prioridad si ambos están rellenos.
- **Contenedores como dispositivos**: los nombres de los contenedores que
  quiere como dispositivos de Gladys, separados por comas (p. ej.
  `gladys, zigbee2mqtt`), o `*` para todos. Vacío: solo el dispositivo What's
  Up Docker. Los disparadores de escena y el widget cubren todos los
  contenedores igualmente.
- **Intervalo de actualización**: 2, 5, 10 o 15 minutos.
- **Aceptar certificados autofirmados**: solo para una dirección `https://` con
  un certificado propio.
- **Idioma de los nombres**: el idioma de los nombres de funciones y de los
  mensajes (francés por defecto).

Guarde y use **Probar la conexión**: la respuesta indica la versión de WUD, el
número de contenedores y de actualizaciones.

### 3. Añadir los dispositivos

Abra la pestaña **Descubrir** de la integración y añada los dispositivos que
desee.

## Los dispositivos

**What's Up Docker** (el servidor):

- **Accesible**: 1 mientras WUD responde, 0 en caso contrario.
- **Contenedores vigilados**: los contenedores que WUD vigila.
- **Actualizaciones disponibles**: los contenedores con una imagen más
  reciente.
- **Actualizaciones mayores**: entre ellas, las mayores (p. ej. 7.x → 8.x).
- **Última actualización encontrada**: la fecha en que la integración vio por
  última vez una nueva actualización (la API de WUD no da fecha de «última
  comprobación»).

**Un dispositivo por contenedor elegido** (con el nombre del contenedor y su
imagen como modelo):

- **Actualización disponible**: 1 mientras WUD tenga una actualización para
  él.
- **Versión actual**: la etiqueta que usa, p. ej. `1.25.0` (y el digest corto
  para una etiqueta móvil como `latest`).
- **Nueva versión**: la etiqueta más reciente encontrada por WUD, o
  «Actualizado».

Un contenedor se reconoce por su nombre y su watcher de WUD, no por su
identificador Docker: un contenedor recreado para actualizarlo sigue siendo el
mismo dispositivo.

## Panel

El widget **Actualizaciones** muestra el número de actualizaciones y de
mayores, luego los contenedores con una actualización, las mayores primero:
nombre, versión actual → nueva y una insignia (Mayor, Menor, Parche, Digest).
Al pulsar se ven la imagen y, cuando WUD lo conoce, un enlace a las notas de la
versión. Si no hay ninguna: «Todos los contenedores están actualizados.». El
botón **Comprobar** pide a WUD que compruebe todos los contenedores (WUD 9
responde en segundo plano, el widget se actualiza en un minuto).

## Escenas

### Disparadores

- **Actualización de contenedor disponible**: WUD ha encontrado una nueva
  versión de la imagen de un contenedor. Anunciada una vez por versión, para
  todos los contenedores (añadidos como dispositivo o no). Filtros: el
  contenedor, el tipo de actualización (mayor, menor, parche, digest de la
  misma etiqueta, otra). Variables: contenedor, imagen, versión actual, nueva
  versión, tipo de actualización.
- **Actualización de contenedor aplicada**: un contenedor que tenía una
  actualización usa una nueva imagen, sin actualización pendiente. Variables:
  contenedor, imagen, versión, versión anterior.

Una actualización pospuesta («snooze» de WUD 9) no se considera aplicada, y
vuelve sin anunciarse dos veces.

### Acciones

- **Comprobar actualizaciones de contenedores**: WUD vuelve a consultar los
  registros ahora, para un contenedor o todos (campo vacío, o el dispositivo
  What's Up Docker). Nunca actualiza un contenedor. Salida: el número de
  contenedores comprobados. Con un token de API, necesita el ámbito write.

### Ideas de escenas

- Cada domingo a las 10:00, **Comprobar actualizaciones de contenedores**, y
  después enviar un mensaje con `[Actualizaciones disponibles]` si es mayor que 0.
- **Actualización de contenedor disponible**, tipo **Mayor**: enviarse un
  mensaje «`container`: `current_version` → `new_version`, lea las notas de la
  versión antes de actualizar».
- **Actualización de contenedor aplicada** en el contenedor `gladys`: enviar un
  mensaje «Gladys actualizado a `version`».

## Solución de problemas

- **«What's Up Docker no responde»**: compruebe la dirección y el puerto (3000
  por defecto), y que la máquina de Gladys pueda alcanzarlo.
- **«WUD pide un usuario y una contraseña, o un token de API»**: WUD 9 siempre
  exige credenciales; introduzca el usuario y la contraseña, o un token.
- **«usuario, contraseña o token rechazado por WUD»**: copie de nuevo el token
  o compruebe la contraseña (un usuario OIDC no puede usar la autenticación
  básica: use un token).
- **«comprobación rechazada: el usuario o el token de WUD es de solo
  lectura»**: dé al token el ámbito write, o use un usuario con el rol rw o
  admin.
- **«la dirección redirige»**: introduzca la dirección `https://`.
- **Falta un contenedor en los dispositivos**: compruebe su nombre exacto en
  WUD (el nombre del contenedor, no la imagen), y que WUD lo vigile (etiqueta
  `wud.watch=true` cuando `WUD_WATCHER_{name}_WATCHBYDEFAULT=false`).
- **Ninguna actualización para una etiqueta `latest`**: WUD solo sigue el
  digest de una etiqueta móvil si la vigilancia de digests está activada
  (etiqueta `wud.watch.digest=true`).

## Límites

- Solo lectura: ni actualización, ni reinicio, ni «trigger» de WUD.
- La primera lectura tras la instalación solo registra las actualizaciones ya
  pendientes: no se anuncian, las siguientes sí.
- Una actualización se detecta en la lectura siguiente (5 minutos por defecto)
  después de que WUD la encuentre, lo que depende a su vez del calendario de
  WUD.
- Solo los contenedores que WUD ve: un contenedor excluido de WUD no existe
  para la integración.
- Para el estado de los contenedores (en marcha, parado, CPU), vea las
  integraciones Docker del store, como
  [gladys-docker](https://github.com/PhilippeMA/gladys-docker) o
  [gladys-portainer](https://github.com/LM1LC3N7/gladys-portainer).
