#!/bin/bash
# API_KEY='AQExhmfxKYrNbBJKw0m/n3Q5qf3Vb4ZMBJ9rW2ZZ03a/zDYdEhhqd+mEeFBcUX7hhxj1AxDBXVsNvuR83LVYjEgiTGAH-MPk8Ecjni2B2uB3J3QRrOn67K28H/OBw7bwKt8cbzmQ=-i1it&YeG>3Jcr>DV9:G'
# MERCHANT='GmailAccount206ECOM'
# WEBHOOK_ID='WBHK42CQV22322C45PSV94CBJC57F4'

API_KEY='AQEyhmfxK4jPaxFLw0m/n3Q5qf3VaY9UCJ14XWZE03G/k2NFiqCZHgQcMi6EzAPbaTJPMfsQwV1bDb7kfNy1WIxIIkxgBw==-kiN9YufYOelQ5EjZTIFJXqEEY8JDFFRe80rJ62k5C80=-i1i:ZYyURy3sT98pv}v'
MERCHANT='AdyenRecruitmentCOM'
WEBHOOK_ID='WBHK4299322322C45PSRP5SGG336RC'
TUNNEL_URL='https://nasa-inventory-pharmacy-variety.trycloudflare.com'
ENV_FILE="$(dirname "$0")/backend/.env"

echo "Updating webhook URL to ${TUNNEL_URL}..."
curl -s -X PATCH \
  "https://management-test.adyen.com/v3/merchants/${MERCHANT}/webhooks/${WEBHOOK_ID}" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${TUNNEL_URL}/api/webhooks/notifications\"}"

echo ""
echo "Generating HMAC key..."
RESPONSE=$(curl -s -X POST \
  "https://management-test.adyen.com/v3/merchants/${MERCHANT}/webhooks/${WEBHOOK_ID}/generateHmac" \
  -H "X-API-Key: ${API_KEY}")

echo "Response: $RESPONSE"

HMAC_KEY=$(echo "$RESPONSE" | grep -o '"hmacKey":"[^"]*"' | cut -d'"' -f4)

if [ -z "$HMAC_KEY" ]; then
  echo "Failed to extract HMAC key. Check the response above."
  exit 1
fi

echo "Writing HMAC key to $ENV_FILE..."
sed -i '' "s/ADYEN_HMAC_KEY=.*/ADYEN_HMAC_KEY=${HMAC_KEY}/" "$ENV_FILE"
echo "Done. Restart your backend for the changes to take effect."
