# SAPostman

SAPostman is a local HTTP workspace available in source mode and desktop Windows/macOS. Open it from the sidebar or **Test in SAPostman** on a POC API integration / n8n use case. Opening/importing never sends a request automatically.

## Endpoints and history

- **Save** creates an endpoint and version 1. **Update** appends a version; concurrent stale updates are rejected. **Save as new** creates a separate endpoint.
- **Version history** loads an earlier snapshot. Use **Update** to restore it as a new version, preserving earlier versions.
- **Delete endpoint** removes the endpoint and its versions after confirmation.
- **History** keeps the last 100 sends, including non-2xx responses, network failures and assertion results. Select one to inspect or replay; delete individual entries as needed.
- Saved endpoints, versions and send history are PostgreSQL tables included in local/cloud backups. Saved credentials are included when explicitly saved. Authentication headers/fields and common JSON secret fields are redacted in send-history snapshots. Payloads and responses may contain other sensitive business data.

## Request tabs

| Tab | Behaviour |
| --- | --- |
| Docs | Markdown documentation per endpoint, with preview and copy |
| Params | Enabled query parameter rows appended to the existing URL |
| Authorization | No Auth, Basic, Bearer, API Key (header/query), JWT Bearer, existing OAuth 2.0 access token |
| Headers | Editable enabled rows and descriptions; transport-controlled headers are rejected |
| Body | None; raw JSON/Text/JavaScript/HTML/XML; URL-encoded; multipart text fields; binary file up to 2 MB; GraphQL query and JSON variables |
| Scripts | Declarative JSON pre-request rules and post-response assertions, validated before sending |
| Settings | Timeout 1–120 seconds, verified TLS, manual redirects, response cap 2 MB |

JWT signing, OAuth token acquisition/refresh, Digest, Hawk and OAuth 1.0 are not implemented. Form-data file parts are not supported; Binary sends one file directly. Beautify formats valid JSON. Raw JavaScript is transmitted as body text, not executed.

Pre-request rules:

```json
{"headers":{"X-Test":"true"},"params":{"debug":"1"}}
```

Post-response assertions:

```json
[
  {"name":"Created","target":"status","equals":201},
  {"name":"Content type","target":"header","path":"content-type","equals":"application/json"},
  {"name":"Success","target":"json","path":"result.ok","equals":true}
]
```

## Variables

Define endpoint variables under **Variables**, for example `base_url = https://example.com` and `customer_id = C123`. Use `{{base_url}}/customers/{{customer_id}}` in the URL and `{{token}}` in Authorization. Enabled variables resolve in URL, params, headers, auth, active body, GraphQL variables and JSON script rules at send time. Values are substituted literally; nested references are supported, while missing, duplicate or circular variables stop sending. Templates and variables are retained in saved endpoints and version history. Mark sensitive values as secret; values referenced by auth are also redacted from history/AI automatically. Re-enter redacted values before replaying history.

## AI

Use **Generate request**, **Trace error**, or **Generate docs** with the configured AI model. Endpoint content and current response are submitted intentionally; auth fields are removed. Review remaining payload/response content before asking. Suggestions appear first; **Apply generated request/docs** changes the editor without saving or sending. Trace output distinguishes response evidence from hypotheses; it cannot inspect the remote server's private logs.

## Verification

Unit checks cover POC cURL import, auth/params/body serialization, assertions, redaction, IPC compatibility, and UI navigation without automatic send. PostgreSQL integration checks cover save/update/conflicts/versions/delete, a real local HTTP send, success/error history, AI suggestion handling with a mock model, and backup/restore. Live provider quality needs testing with a configured model.
