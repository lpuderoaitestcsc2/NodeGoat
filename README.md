# Benefits Portal

Benefits Portal is a Node.js application for managing employee benefits and retirement savings information. Employees can maintain their profiles, adjust contribution percentages, review investment allocations, browse research, and exchange memos. Administrators can manage benefit information through a dedicated view.

## Architecture

The application uses Express for HTTP routing, MongoDB for persistence, and Swig templates with Bootstrap for the browser interface. Route handlers live in `app/routes`, database access modules in `app/data`, and page templates in `app/views`. `server.js` configures middleware and starts the HTTP listener.

## Local setup

Install Node.js and npm, and start a MongoDB instance compatible with the bundled driver. The container configuration uses Node.js 12 and MongoDB 4.4.

```sh
npm ci
export MONGODB_URI=mongodb://localhost:27017/benefits_portal
node artifacts/db-reset.js
npm start
```

Open http://localhost:4000. Set `PORT` to use another port. For automatic restarts during development, run `npm run dev` (port 5000).

The database initialization script replaces existing users, allocations, contributions, memos, and counters in the selected database. Run it only against a database whose contents you can discard. It creates initial accounts, including `admin` / `Admin_123` and `user1` / `User1_123`.

## Containers

```sh
docker-compose up --build
```

The web service waits for MongoDB, initializes the database, and serves the application on port 4000. Its startup command resets the selected collections each time it runs.

## Configuration

Defaults live in `config/env/all.js`; environment-specific settings live in `config/env`. `MONGODB_URI`, `PORT`, and `NODE_ENV` control database connectivity, the listener port, and configuration selection. Existing data stored under a previous database name requires an explicit `MONGODB_URI` or a separate migration.

The server uses HTTP. Deployments requiring HTTPS should terminate TLS at a reverse proxy. Review authentication, session settings, input handling, and dependency versions before deploying with real employee or financial information.

## Development checks

```sh
npm run test:ci
npm test
```

The Cypress suite covers login, signup, profiles, benefits, contributions, allocations, memos, and research. End-to-end checks need a running application and MongoDB. `npm test` invokes the Grunt unit-test task. The optional ZAP regression suite lives in `test/security` and uses the settings in `config/env/test.js`.

## License

Apache License 2.0. See [LICENSE](LICENSE).
