# IRIS API (iris-node)

Backend serverless (Vercel) del proyecto IRIS. Lo usan la web ([javana24/Iris](https://github.com/javana24/Iris)) y la app Android ([javana24/IRISAPPMOVIL](https://github.com/javana24/IRISAPPMOVIL)).

- **Consejero IRIS**: orienta sobre relaciones sanas y detecta situaciones de riesgo.
- **Simulador de pareja celosa** (3 niveles de dificultad), con **banderas rojas** que explican cada táctica de control.
- **Informe de entrenamiento**: evalúa cómo ha respondido la persona usuaria en el simulador.

## Flujo

```text
Web / App Android
  -> https://<proyecto>.vercel.app/api/chat
  -> iris-node (Vercel)
       1º Ollama en el Spark del instituto  (https://ollama.irisapp.es, Cloudflare Tunnel)
       2º Groq (respaldo gratuito, gpt-oss-120b) si el Spark falla o tarda
```

El orden se cambia con `AI_PROVIDERS` sin tocar código.

## Endpoints

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/api/chat` | `{messages:[{role,text}], simulatorMode:"iris"\|"partner", difficulty?:"sutil"\|"moderada"\|"intensa", language?:"es"\|"en"}` | `{response, redFlags:[{tactic,label,explanation}], riskLevel, safetyAlert?, safetyMessage?, provider}` |
| POST | `/api/analyze` | `{messages, difficulty?, language?}` (conversación del simulador) | `{score, summary, strengths[], improvements[], tacticsDetected[], betterResponses[], provider}` |
| GET | `/api/health` | | `{ok, providers:[{name, ok, model, error?}]}` (503 si no hay ninguno disponible) |
| GET | `/api/models` | | Proveedores configurados y su orden |

`safetyAlert` solo se activa con riesgo alto real (agresión, amenazas graves, suicidio/autolesión) en el **último** mensaje de la persona usuaria, o si el modelo lo valora como `urgent`. Los mensajes de la pareja simulada nunca disparan la alerta: para eso están las banderas rojas.

## Variables de entorno (Vercel → Settings → Environment Variables)

Ver [.env.example](.env.example).

| Variable | Valor recomendado |
|---|---|
| `AI_PROVIDERS` | `groq,ollama` mientras el Spark tenga `llama3.1` 8B; `ollama,groq` cuando tenga un modelo mayor |
| `OLLAMA_BASE_URL` | `https://ollama.irisapp.es` |
| `OLLAMA_MODEL` | `llama3.1:latest` (o el modelo nuevo instalado en el Spark) |
| `GROQ_API_KEY` | key gratuita de https://console.groq.com/keys |
| `GROQ_MODEL` | `openai/gpt-oss-120b` (por defecto; no hace falta ponerla) |

### Mejorar el modelo del Spark

Conectado por OpenVPN al Spark:

```bash
nvidia-smi && free -h          # ver memoria disponible
ollama pull qwen3:30b-a3b       # rápido (MoE) y buen español; alternativa: gemma3:27b
```

Después, en Vercel: `OLLAMA_MODEL=qwen3:30b-a3b` y `AI_PROVIDERS=ollama,groq`.

## Desarrollo

```bash
cp .env.example .env   # y rellena GROQ_API_KEY
npm run dev            # http://localhost:3001
npm test
```

Sin dependencias npm (usa `fetch` nativo, Node 20+).
