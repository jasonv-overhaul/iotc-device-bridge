const handleMessage = require("./lib/engine");
const identity = require("@azure/identity");
const KeyVaultSecret = require("@azure/keyvault-secrets");

const clientId = null || process.env.AZURE_CLIENT_ID;
const KEY_VAULT_URL = null || process.env.KEY_VAULT_URL;
const SECRET_NAME = null || process.env.SECRET_NAME;

const parameters = {
  idScope: process.env.ID_SCOPE,
  primaryKeyUrl: process.env.IOTC_KEY_URL,
};

module.exports = async function (context, req) {
  try {
    await handleMessage(
      {
        ...parameters,
        log: context.log,
        getSecret: getKeyVaultSecret,
        getCredentials: getKeyVaultCredentials,
      },
      req.body
    );
  } catch (e) {
    context.log("[ERROR]", e.message);
    context.res = {
      status: e.statusCode ? e.statusCode : 500,
      body: e.message,
    };
  }
};

function getKeyVaultCredentials() {
  return new identity.ChainedTokenCredential(
    new identity.DefaultAzureCredential(),
    new identity.ManagedIdentityCredential(clientId)
  );
}

function getKeyVaultSecret(credentials) {
  let keyVaultClient = new KeyVaultSecret.SecretClient(
    KEY_VAULT_URL,
    credentials
  );
  return keyVaultClient.getSecret(SECRET_NAME);
}
