import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';

let cachedToken = null;
let tokenExpiresAt = 0;

function getPayoutBaseUrl() {
  const isProd =
    env.CASHFREE_ENV?.toUpperCase() === 'PROD' || env.CASHFREE_ENV?.toLowerCase() === 'production';
  return isProd
    ? 'https://payout-api.cashfree.com/payout/v1'
    : 'https://payout-gamma.cashfree.com/payout/v1';
}

/**
 * Cashfree Payouts integration for automated fund transfers to UPI and Bank Accounts.
 */
export const cashfreePayoutGateway = {
  name: 'cashfree_payout',

  get isConfigured() {
    return env.isCashfreeConfigured;
  },

  /**
   * Generates or retrieves an active authorization bearer token for Cashfree Payout API.
   */
  async getAuthToken() {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now + 30_000) {
      return cachedToken;
    }

    if (!env.isCashfreeConfigured) {
      throw new Error('Cashfree credentials missing (CASHFREE_APP_ID / CASHFREE_SECRET_KEY)');
    }

    const res = await fetch(`${getPayoutBaseUrl()}/authorize`, {
      method: 'POST',
      headers: {
        'X-Client-Id': env.CASHFREE_APP_ID,
        'X-Client-Secret': env.CASHFREE_SECRET_KEY,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    if (!res.ok || data.status !== 'SUCCESS' || !data.data?.token) {
      logger.error({ status: res.status, data }, 'Cashfree Payout auth token generation failed');
      throw new Error(data.message || 'Failed to authenticate with Cashfree Payouts');
    }

    cachedToken = data.data.token;
    // Token is valid for 300 seconds by default
    tokenExpiresAt = now + 270_000;
    return cachedToken;
  },

  /**
   * Transfers funds directly to a user's UPI VPA or Bank Account.
   *
   * @param {Object} params
   * @param {string} params.transferId - Unique transaction ID
   * @param {number} params.amountInRupees - Amount in INR (e.g. 10.00)
   * @param {string} params.payoutMethod - 'upi' or 'bank_transfer'
   * @param {string} [params.upiId] - User's UPI VPA
   * @param {Object} [params.bankDetails] - Bank details (accountNumber, ifsc, accountHolderName, phone)
   * @param {string} [params.remarks] - Transfer note
   */
  async initiateTransfer({
    transferId,
    amountInRupees,
    payoutMethod,
    upiId,
    bankDetails = {},
    user = {},
    remarks = 'Vibe Chat Earnings Withdrawal',
  }) {
    const amount = Number(Number(amountInRupees).toFixed(2));
    if (amount <= 0) {
      throw new Error('Transfer amount must be greater than 0');
    }

    if (!env.isCashfreeConfigured) {
      throw new Error('Cashfree Payouts is not configured');
    }

    const token = await this.getAuthToken();
    const isUpi = payoutMethod === 'upi';

    const payload = {
      transferId: String(transferId),
      amount: String(amount),
      transferMode: isUpi ? 'upi' : 'banktransfer',
      remarks: remarks.slice(0, 70),
      beneDetails: {
        beneId: String(user.id || 'bene_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40),
        name: (bankDetails.accountHolderName || user.name || user.nickname || 'Beneficiary').slice(0, 60),
        email: user.email || 'payout@vibechat.app',
        phone: String(bankDetails.phone || user.phone || '9876543210').replace(/\D/g, '').slice(-10) || '9876543210',
        address1: 'India',
        ...(isUpi
          ? { vpa: upiId }
          : {
              bankAccount: bankDetails.accountNumber,
              ifsc: bankDetails.ifsc?.toUpperCase(),
            }),
      },
    };

    logger.info({ transferId, amount, transferMode: payload.transferMode }, 'Initiating Cashfree Payout transfer');

    const res = await fetch(`${getPayoutBaseUrl()}/requestTransfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || data.status === 'ERROR') {
      logger.error({ status: res.status, data }, 'Cashfree Payout transfer request failed');
      throw new Error(data.message || `Cashfree Transfer Error: ${data.subCode || res.statusText}`);
    }

    return {
      status: data.data?.acknowledged === 1 ? 'PROCESSING' : (data.data?.status || 'PROCESSING'),
      referenceId: data.data?.referenceId || data.data?.utr || transferId,
      utr: data.data?.utr || null,
      message: data.message || 'Transfer initiated successfully',
      rawResponse: data,
    };
  },

  /**
   * Retrieves transfer status from Cashfree.
   */
  async getTransferStatus({ transferId, referenceId }) {
    if (!env.isCashfreeConfigured) {
      throw new Error('Cashfree is not configured');
    }

    const token = await this.getAuthToken();
    const query = referenceId ? `referenceId=${referenceId}` : `transferId=${transferId}`;

    const res = await fetch(`${getPayoutBaseUrl()}/getTransferStatus?${query}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to fetch Cashfree transfer status');
    }

    return data.data;
  },
};
