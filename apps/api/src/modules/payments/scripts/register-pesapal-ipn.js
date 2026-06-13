const fs = require('fs');
const path = require('path');

// Read root .env file
const envPath = path.join(__dirname, '../../../../../../.env');
if (!fs.existsSync(envPath)) {
  console.error(`Could not find .env file at ${envPath}`);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');

function getEnvVar(key) {
  const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

const baseUrl = getEnvVar('PESAPAL_BASE_URL') || 'https://cybqa.pesapal.com/pesapalv3';
const consumerKey = getEnvVar('PESAPAL_CONSUMER_KEY');
const consumerSecret = getEnvVar('PESAPAL_CONSUMER_SECRET');
const callbackUrl = 'https://arofi.arosoftlabs.com/api/payments/webhooks/pesapal';

if (!consumerKey || consumerKey.startsWith('GET_FROM') || consumerKey.startsWith('CHANGE_ME')) {
  console.error('PESAPAL_CONSUMER_KEY is not set in .env');
  process.exit(1);
}
if (!consumerSecret || consumerSecret.startsWith('GET_FROM') || consumerSecret.startsWith('CHANGE_ME')) {
  console.error('PESAPAL_CONSUMER_SECRET is not set in .env');
  process.exit(1);
}

// Clean base URL (strip trailing slashes, /api/Auth/RequestToken)
const cleanedBaseUrl = baseUrl.replace(/\/api\/Auth\/RequestToken\/?$/i, '').replace(/\/$/, '');

console.log(`Using Base URL: ${cleanedBaseUrl}`);
console.log(`Consumer Key: ${consumerKey}`);

async function run() {
  try {
    // 1. Get Access Token
    console.log('Authenticating with Pesapal...');
    const authRes = await fetch(`${cleanedBaseUrl}/api/Auth/RequestToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret
      })
    });

    if (!authRes.ok) {
      const errText = await authRes.text();
      throw new Error(`Authentication failed: ${authRes.statusText} - ${errText}`);
    }

    const authData = await authRes.json();
    const token = authData.token || authData.access_token;
    if (!token) {
      throw new Error('No access token returned in Pesapal response');
    }
    console.log('Successfully authenticated!');

    // 2. Fetch existing IPNs to see if our callback URL is already registered
    console.log('Checking existing IPN registrations...');
    const listRes = await fetch(`${cleanedBaseUrl}/api/URLSetup/GetIpnList`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    let existingIpn = null;
    if (listRes.ok) {
      const listData = await listRes.json();
      if (Array.isArray(listData)) {
        existingIpn = listData.find(item => item.url && item.url.trim() === callbackUrl);
        
        console.log('\n--- Registered IPN List ---');
        listData.forEach(item => {
          console.log(`URL: ${item.url} -> ID: ${item.ipn_id}`);
        });
        console.log('---------------------------\n');
      }
    } else {
      console.log('Failed to fetch existing IPN list. Will try registering directly.');
    }

    let ipnId = null;
    if (existingIpn) {
      console.log(`Found existing registered IPN URL: ${callbackUrl}`);
      console.log(`Existing IPN ID (UUID): ${existingIpn.ipn_id}`);
      ipnId = existingIpn.ipn_id;
    } else {
      console.log(`Registering new IPN URL: ${callbackUrl}`);
      const regRes = await fetch(`${cleanedBaseUrl}/api/URLSetup/RegisterIPN`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url: callbackUrl,
          ipn_notification_type: 'POST'
        })
      });

      if (!regRes.ok) {
        const regErrText = await regRes.text();
        throw new Error(`IPN registration failed: ${regRes.statusText} - ${regErrText}`);
      }

      const regData = await regRes.json();
      ipnId = regData.ipn_id || regData.ipnId;
      if (!ipnId) {
        throw new Error(`IPN registration response did not contain ipn_id. Response: ${JSON.stringify(regData)}`);
      }
      console.log(`Successfully registered new IPN URL!`);
      console.log(`Generated IPN ID (UUID): ${ipnId}`);
    }

    // 3. Update the .env file with the IPN ID
    console.log('Updating your .env file with the IPN ID...');
    let updatedEnvContent = envContent;
    if (envContent.includes('PESAPAL_IPN_ID=')) {
      updatedEnvContent = envContent.replace(/^PESAPAL_IPN_ID=.*$/m, `PESAPAL_IPN_ID=${ipnId}`);
    } else {
      updatedEnvContent += `\nPESAPAL_IPN_ID=${ipnId}\n`;
    }
    fs.writeFileSync(envPath, updatedEnvContent, 'utf8');
    console.log(`Successfully updated PESAPAL_IPN_ID in ${envPath}!`);

  } catch (error) {
    console.error('Error occurred:', error.message);
    process.exit(1);
  }
}

run();
