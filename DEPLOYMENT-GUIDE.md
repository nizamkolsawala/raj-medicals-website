# Raj Medicals Deployment Guide

This website is now integrated as one app:

- Frontend: `index.html`, `styles.css`, `app.js`
- Backend: `server.js`
- Start command: `npm start`
- Local backend URL: `http://localhost:8090` when using `start-backend.bat`

## Recommended live hosting

Use a Node.js web service because the backend receives orders and approves them. Static hosting alone will not work for order receiving.

## Render setup

1. Create a GitHub repository and upload the files from this `outputs` folder.
2. In Render, create a new Web Service from that GitHub repository.
3. Use these settings:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
4. Add environment variables:
   - `ADMIN_PIN`: choose a private pharmacist PIN
   - `DATA_DIR`: `/data`
5. Add a persistent disk mounted at `/data` so orders and prescriptions are not lost when the service restarts.
6. Deploy. Your public website will be available on the Render URL.

## Important safety notes

- Do not share the pharmacist PIN with customers.
- Prescription files contain private medical information, so use a paid hosting plan with persistent storage and access controls for real business use.
- For production, add a full admin login and database before handling large order volume.

## Local testing

Run:

```powershell
.\start-backend.bat
```

Then open:

```text
http://localhost:8090
```

The default local pharmacist PIN is:

```text
1234
```
