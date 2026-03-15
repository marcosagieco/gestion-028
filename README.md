Sistema de Gestión Interna - 028import 📊

Desarrollé esta plataforma con el objetivo de centralizar y digitalizar la operativa interna de 028import. Mi enfoque principal fue sustituir el uso de registros manuales y planillas por una solución digital integral que permitiera un control preciso del inventario y las ventas desde un solo lugar.


Dashboard Administrativo

Esta interfaz fue diseñada para optimizar la toma de decisiones del dueño del negocio. Implementé herramientas específicas que transforman los datos en información útil para la operativa diaria:

Control de Inventario: Desarrollé un sistema dinámico para la carga, edición y baja de productos, garantizando que la base de datos sea siempre un reflejo fiel del stock físico.

Registro de Transacciones: Implementé un módulo de ventas que permite trackear cada transacción, facilitando el control de ingresos y la rotación de productos.

Sincronización de Stock: Decidí utilizar Firestore para asegurar que cualquier cambio administrativo impacte de forma inmediata en el catálogo público, evitando pedidos de artículos sin stock.


Decisiones del Tech Stack:

Seleccioné estas tecnologías para garantizar un entorno de trabajo ágil, seguro y escalable:

React.js (Vite): Lo elegí por su eficiencia en el manejo del estado y la notable velocidad que ofrece tanto en el proceso de desarrollo como en la carga final del dashboard.

Firebase (Firestore & Auth): Implementé estas herramientas para asegurar la persistencia de datos en tiempo real y, fundamentalmente, para restringir el acceso al sistema mediante una autenticación robusta.

Tailwind CSS: Utilicé este framework para lograr una interfaz limpia y funcional, diseñada para ser utilizada cómodamente tanto en computadoras de escritorio como en tablets.

Seguridad (Variables de Entorno): Prioricé la protección de la configuración técnica mediante el uso de variables de entorno, evitando la exposición de credenciales sensibles en el repositorio.
