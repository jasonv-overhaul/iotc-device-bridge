# Overhaul IOTCentral Connector

![CI](https://github.com/jasonv-overhaul/iotc-device-bridge/workflows/CI/badge.svg?branch=main)

This repo contains the Resource Group (organized collection of Azure Resources) required to connect our outbound data feed to Azure's IOTCentral. When deployed, this project creates an azure Resource Group containing a FunctionApp (NodeJS) and an Azure KeyVault.

The function app listens for incoming JSON device messages from our Integrations Cloud. It will pass them along to the appropriate device (based on the data) in Azure's IOTCentral.

The device data schema is located in `schema.json` in this repo.

## TODO

---

- continue adapting and clean up the code
- add tests
- address all TODOs
- ensure this runs in Azure itself
- adapt/test to the new schema once Balaji gets the messaages coming over
- insert timestamps if not present

---

## Prerequisites

To use the solution you will need the following:

- an Azure account. You can create a free Azure account from [here](https://aka.ms/aft-iot)
- an Azure IoT Central application to connect the devices. Create a free app by following [these instructions](https://docs.microsoft.com/en-us/azure/iot-central/quick-deploy-iot-central)
- Store the following environment variables in `local.settings.json`. When you configure the Function App (Function App > Coinfiguration > Application Settings) you put the env variables there. That can also be done programmatically.

You will need environment variables for all of these:

| NAME                       | HINT                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`          | App Registrations > Overview > Application (client) ID                                                                             |
| `AZURE_CLIENT_SECRET`      | App Registrations > Certificates and secrets > New client secret > (store the value shown upon creation)                           |
| `AZURE_TENANT_ID`          | App Registrations > Overview > Directory (tenant) ID                                                                               |
| `AzureWebJobsStorage`      | leave blank                                                                                                                        |
| `FUNCTIONS_WORKER_RUNTIME` | "node"                                                                                                                             |
| `ID_SCOPE`                 | Visit `https://your-app.azureiotcentral.com/admin/device-connection` > Administration > Device connection > ID scope               |
| `IOTC_KEY_URL`             | Visit `https://your-app.azureiotcentral.com/admin/device-connection` > Administration > Device connection > SAS Tokens > View Keys |
| `KEY_VAULT_URL`            | Key Vault > Overview > DNS name (click the copy icon)                                                                              |
| `SECRET_NAME`              | The name of the secret, in this codebase, it's `iotckey`.                                                                          |
| `SECRET_VERSION`           | Key Vault > Secrets > keyname (eg. `iotckey`) > ... and copy the current version number, which looks like a long SHA.              |

## Developing

### Local Development

You can run this locally by

- install all those Azure extensions in VS Code
- logging in
- Filling in the environment variables found in `local.settings.json`.
- Press Function-F5 (or just F5) to run / debug, take note of the URL that appears in the console
- Use Postman to post your queries to the URL

This solution also supports local debugging and remote log streaming.

### Deploying

### Continuous Deployment

This app is configured to autodeploy to Azure using GitHub functions. Whenever the `main` branch is pushed to, it will autodeploy. So, when your PRs are merged it will autodeploy to Azure.

### Manual Deploy via _Deploy to Azure_

[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fjasonv-overhaul%2Fiotc-device-bridge%2Fmaster%2Fazuredeploy.json)

If you clone this repo or in anyway move it away from the above URL-encoded URL, it will fail. So, update the link above.

### Manual via Azure's Zip Deploy

- ZIP up the function

```
zip -r iotc-bridge-az-function.zip IoTCIntegration
```

- Upload the ZIP file by dragging and dropping the file in the directory browser here:

```
https://iotc-pln62j7k2vohgkzg.scm.azurewebsites.net/ZipDeployUI
```

### Manually from the CLI

You can deploy from the `az` CLI like the following (be warned, it might be pulling from the ZipFile in GitHub):

```
# deploy from template
az deployment group create --resource-group IOTC --name az-cli-test-jav --template-file azuredeploy.json
```

You will need to be auth'd with the CLI; you will need to also know the `scopeID` and `SAS` key(s). See the Environment Variables section below to learn how to find those,

## How I got this working...

---

- Install all the VS Code extensions for Azure
- Login to Azure in VS Code

- Create an IOTCentral Application

  - Create a blank Device Template
  - Under this new IOTCentral Application, surf to: Administration > Device connection > ... and copy down the `ID scope` and `primary SAS token`.

- Deploying this code, either through the Click-To-Deploy in this README or through the GitHub actions CD, automatically scaffolds up the following if they don't exist:
  - Storage Account (Microsoft.Storage/storageAccounts)
  - Serverfarms (Microsoft.Web/serverfarms)
  - FunctionApp (Microsoft.Web/sites)
  - KeyVault (Microsoft.KeyVault/vaults)

The trick for this to work was to:

- zip up the distro and add it to GitHub (!!)
- point the click-to-deploy to this zip file

The better solution there is to either add the zip-step as a git-pre-commit hook or, ideally, to add the zip step the build server actions in GitHub.

- I took note of the FunctionApp name that was created. Knowing that, you can manually deploy this code by zipping it up: `` and then dumping the zip file in the file browser you find at `https://function-name.scm.azurewebsites.net/ZipDeployUI` for example, `https://iotc-pln62j7k2vohgkzg.scm.azurewebsites.net/ZipDeployUI`.

If you do not need to develop locally, you're essentially done. But the MSI creds won't work locally, so I had to strip out the REST-based auth and move to client SDK-based auth. It's not ideal for secrets mgt, but it actually works.

Next, since we moved away from MSI, I had to use ActiveDirectory to create a new App Registration (which is just a new app). Then, you need to create a client secret in `AppRegistrations > Certificates and secrets > Client Secrets`.
