import { env } from "@/lib/env";
import { NotFound } from "@/lib/errors";
import { defineRoute } from "@/lib/route";

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Baba Communication API — Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; background: #f6f7f9; }
    .topbar { display: none; }
    #swagger-ui { max-width: 1460px; margin: 0 auto; padding: 16px; }
    .swagger-ui .info .title { font-size: 28px; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      defaultModelsExpandDepth: 2,
      docExpansion: 'list',
    });
  </script>
</body>
</html>`;

export const GET = defineRoute((_req, res) => {
  if (!env.apiDocsEnabled) throw NotFound("Endpoint not found");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(SWAGGER_UI_HTML);
});
