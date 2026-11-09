# MediAlert

Prototipo educativo de verificación de medicamentos. El motor de reglas compara la prescripción vigente con el registro y clasifica las discrepancias. Gemini puede explicar el hallazgo para fines de formación.

**[Abrir simulador público de alertas](https://ivancito183.github.io/medialert/)**. Incluye cuatro casos ficticios con resultados generados por el motor de Python. La demo de GitHub Pages funciona sin cuenta ni clave y utiliza resultados precalculados. El proyecto completo incluye los paneles de medicina y enfermería, la bitácora y la API.

## Publicar la aplicación con inicio de sesión

[Desplegar Medialert en Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Fivancito183%2Fmedialert)

Inicia sesión en Render y completa SEED_DOCTOR_PASSWORD y SEED_NURSE_PASSWORD en la pantalla de despliegue. Puedes usar las mismas contraseñas de demostración que ya tienes. Cuando termine, comparte el enlace .onrender.com del servicio. Los usuarios son ivan@medialert.demo y sofia@medialert.demo.

La instancia gratuita crea una base separada con casos ficticios. Sus cambios se pierden al reiniciar el servicio. Para mostrar la demo usa datos ficticios.

## Ejecutar el proyecto completo

Se requiere Python 3.12 y Node.js 22. Ejecuta estos comandos en PowerShell desde el repositorio.

En una terminal, inicia la API con una base local para la demo.

~~~powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
~~~

En el archivo local backend/.env, define DATABASE_URL=sqlite:///./medialert_demo.db y reemplaza SECRET_KEY por una clave aleatoria generada con python -c "import secrets; print(secrets.token_urlsafe(48))". Ejecuta el siguiente bloque con una base nueva. El comando seed muestra las credenciales de los usuarios ficticios en la terminal.

~~~powershell
.\.venv\Scripts\python.exe -m app.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
~~~

En otra terminal, inicia la interfaz.

~~~powershell
cd frontend
npm ci
npm run dev
~~~

Abre [la aplicación local](http://localhost:5173). La documentación de la API está en [Swagger](http://localhost:8000/api/docs).

## Gemini para explicaciones educativas

Crea una clave en un proyecto del [nivel gratuito de Gemini](https://ai.google.dev/gemini-api/docs/pricing) sin facturación y configura GEMINI_API_KEY en backend/.env. Reinicia la API. El modelo predeterminado es gemini-3.1-flash-lite. Gemini se invoca desde el servidor y está sujeto a las cuotas del proyecto. Si falta la clave o la llamada falla, la aplicación devuelve la explicación del motor de reglas. Usa únicamente datos ficticios con el nivel gratuito.

Para regenerar los ejemplos del simulador, ejecuta python docs/generate_cases.py desde la raíz. Para verificar el motor, ejecuta .\.venv\Scripts\python.exe -m pytest desde backend.
