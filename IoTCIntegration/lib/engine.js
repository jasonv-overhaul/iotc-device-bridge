const crypto = require("crypto");
const Device = require("azure-iot-device");
const DeviceTransport = require("azure-iot-device-http");
const request = require("request-promise-native");

const StatusError = require("../error").StatusError;

const registrationHost = "global.azure-devices-provisioning.net";
const registrationSasTtl = 3600; // 1 hour
const registrationApiVersion = `2018-11-01`;
const registrationStatusQueryAttempts = 10;
const registrationStatusQueryTimeout = 2000;
const minDeviceRegistrationTimeout = 60 * 1000; // 1 minute

const deviceCache = {};

module.exports = async function (context, body) {
  const shipmentDevices = body["data"]["shipment_devices"];
  for (const deviceEnvelope of shipmentDevices) {
    const device = deviceEnvelope.imei;
    const client = Device.Client.fromConnectionString(
      await getDeviceConnectionString(context, device),
      DeviceTransport.Http
    );
    try {
      const message = new Device.Message(JSON.stringify(body));
      message.contentEncoding = "utf-8";
      message.contentType = "application/json";

      await client.open();
      context.log("[HTTP] Sending telemetry for device", device);
      await client.sendEvent(message);
      await client.close();
    } catch (e) {
      // If the device was deleted, we remove its cached connection string
      if (e.name === "DeviceNotFoundError" && deviceCache[device]) {
        delete deviceCache[device].connectionString;
      }

      throw new Error(
        `Unable to send telemetry for device ${device}: ${e.message}`
      );
    }
  }
};

async function getDeviceConnectionString(context, device) {
  if (deviceCache[device] && deviceCache[device].connectionString) {
    return deviceCache[device].connectionString;
  }
  const deviceHub = await getDeviceHub(context, device);
  const deviceKey = await getDeviceKey(context, device);
  const connStr = `HostName=${deviceHub};DeviceId=${device};SharedAccessKey=${deviceKey}`;
  deviceCache[device].connectionString = connStr;

  return connStr;
}

async function getDeviceHub(context, device) {
  const now = Date.now();

  // A 1 minute backoff is enforced for registration attempts, to prevent unauthorized devices
  // from trying to re-register too often.
  if (
    false && // TODO REMOVE ME AFTER TESTING
    deviceCache[device] &&
    deviceCache[device].lasRegisterAttempt &&
    now - deviceCache[device].lasRegisterAttempt < minDeviceRegistrationTimeout
  ) {
    const backoff = Math.floor(
      (minDeviceRegistrationTimeout -
        (now - deviceCache[device].lasRegisterAttempt)) /
        10000 // TODO: Change this to 1000
    );
    throw new StatusError(
      `Unable to register device ${device}. Minimum registration timeout not yet exceeded. Please try again in ${backoff} seconds`,
      403
    );
  }

  deviceCache[device] = {
    ...deviceCache[device],
    lasRegisterAttempt: Date.now(),
  };

  const sasToken = await getRegistrationSasToken(context, device);

  const registrationOptions = {
    url: `https://${registrationHost}/${context.idScope}/registrations/${device}/register?api-version=${registrationApiVersion}`,
    method: "PUT",
    json: true,
    headers: { Authorization: sasToken },
    body: { registrationId: device },
  };

  try {
    context.log("[HTTP] Initiating device registration");
    const response = await request(registrationOptions);

    if (response.status !== "assigning" || !response.operationId) {
      throw new Error("Unknown server response");
    }

    const statusOptions = {
      url: `https://${registrationHost}/${context.idScope}/registrations/${device}/operations/${response.operationId}?api-version=${registrationApiVersion}`,
      method: "GET",
      json: true,
      headers: { Authorization: sasToken },
    };

    // The first registration call starts the process, we then query the registration status
    // every 2 seconds, up to 10 times.
    for (let i = 0; i < registrationStatusQueryAttempts; ++i) {
      await new Promise((resolve) =>
        setTimeout(resolve, registrationStatusQueryTimeout)
      );

      context.log("[HTTP] Querying device registration status");
      const statusResponse = await request(statusOptions);

      if (statusResponse.status === "assigning") {
        continue;
      } else if (
        statusResponse.status === "assigned" &&
        statusResponse.registrationState &&
        statusResponse.registrationState.assignedHub
      ) {
        return statusResponse.registrationState.assignedHub;
      } else if (
        statusResponse.status === "failed" &&
        statusResponse.registrationState &&
        statusResponse.registrationState.errorCode === 400209
      ) {
        throw new StatusError("The device may be unassociated or blocked", 403);
      } else {
        throw new Error("Unknown server response");
      }
    }

    throw new Error(
      "Registration was not successful after maximum number of attempts"
    );
  } catch (e) {
    throw new StatusError(
      `Unable to register device ${device}: ${e.message}`,
      e.statusCode
    );
  }
}

async function getRegistrationSasToken(context, device) {
  const uri = encodeURIComponent(`${context.idScope}/registrations/${device}`);
  const ttl = Math.round(Date.now() / 1000) + registrationSasTtl;
  const signature = crypto
    .createHmac(
      "sha256",
      new Buffer(await getDeviceKey(context, device), "base64")
    )
    .update(`${uri}\n${ttl}`)
    .digest("base64");
  return `SharedAccessSignature sr=${uri}&sig=${encodeURIComponent(
    signature
  )}&skn=registration&se=${ttl}`;
}

/**
 * Computes a derived device key using the primary key.
 */
async function getDeviceKey(context, device) {
  if (deviceCache[device] && deviceCache[device].deviceKey) {
    return deviceCache[device].deviceKey;
  }

  const creds = await context.getCredentials();
  const secret = await context.getSecret(creds);
  const key = crypto
    .createHmac("SHA256", Buffer.from(secret.value, "base64"))
    .update(device)
    .digest()
    .toString("base64");

  deviceCache[device].deviceKey = key;
  return key;
}
