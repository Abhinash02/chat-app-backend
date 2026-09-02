import { beforeEach, describe, expect, it } from 'vitest';

import { GENDER, USER_ROLE } from '#src/common/constants/index.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { withdrawalService } from '#src/modules/withdrawals/withdrawal.service.js';
import { WITHDRAWAL_STATUS } from '#src/modules/withdrawals/withdrawal.constants.js';
import { applySettings, createUser, resetDatabase } from '../helpers/factories.js';

describe('Girls Chat-to-Earn and Coin-to-Rupee Withdrawals', () => {
  beforeEach(async () => {
    await resetDatabase();
    await applySettings({
      earnings: {
        enabled: true,
        messagesPerReward: 25,
        rewardCoins: 1,
        coinsPerRupee: 25,
        minWithdrawalCoins: 25,
      },
    });
  });

  describe('Chat Earning Mechanism', () => {
    it('should award 1 coin to a girl after sending 25 messages to a boy', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const boy = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: girl._id, gender: girl.gender });

      // Send 24 messages
      for (let i = 0; i < 24; i += 1) {
        const res = await coinsService.recordGirlChatMessage({
          senderId: girl._id,
          senderGender: girl.gender,
          recipientGender: boy.gender,
          conversationId: null,
        });
        expect(res.rewarded).toBe(false);
      }

      let wallet = await walletRepository.findByUserId(girl._id);
      expect(wallet.girlChatMessagesCount).toBe(24);
      expect(wallet.coinBalance).toBe(0);

      // 25th message triggers reward!
      const rewardRes = await coinsService.recordGirlChatMessage({
        senderId: girl._id,
        senderGender: girl.gender,
        recipientGender: boy.gender,
        conversationId: null,
      });

      expect(rewardRes.rewarded).toBe(true);
      expect(rewardRes.rewardCoins).toBe(1);

      wallet = await walletRepository.findByUserId(girl._id);
      expect(wallet.girlChatMessagesCount).toBe(0); // reset progress in cycle
      expect(wallet.coinBalance).toBe(1);
      expect(wallet.totalEarnedCoins).toBe(1);
    });

    it('should not award coins if sender is male or recipient is not male', async () => {
      const boy1 = await createUser({ gender: GENDER.MALE });
      const boy2 = await createUser({ gender: GENDER.MALE });

      const res = await coinsService.recordGirlChatMessage({
        senderId: boy1._id,
        senderGender: boy1.gender,
        recipientGender: boy2.gender,
        conversationId: null,
      });

      expect(res).toBeNull();
    });
  });

  describe('Coin to Rupee Conversion & Admin Approval Flow', () => {
    it('should convert 25 coins into ₹1.00, debit coins, and complete on admin approval', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE, name: 'Priya Sharma' });
      const admin = await createUser({ role: USER_ROLE.ADMIN });

      // Seed 100 coins to girl
      await coinsService.creditCoins({
        userId: girl._id,
        gender: girl.gender,
        amount: 100,
        type: 'admin_credit',
        description: 'Test coins',
      });

      // Girl requests withdrawal of 25 coins (₹1.00)
      const reqRes = await withdrawalService.requestWithdrawal({
        user: girl,
        coins: 25,
        payoutMethod: 'upi',
        upiId: 'priya@okhdfcbank',
      });

      expect(reqRes.withdrawal.amountInRupees).toBe(1);
      expect(reqRes.withdrawal.status).toBe(WITHDRAWAL_STATUS.PENDING);

      let wallet = await walletRepository.findByUserId(girl._id);
      expect(wallet.coinBalance).toBe(75); // 100 - 25 debited

      // Admin approves
      const approved = await withdrawalService.approveWithdrawal({
        withdrawalId: reqRes.withdrawal._id,
        adminUser: admin,
        mode: 'manual',
        utr: 'UTR987654321',
      });

      expect(approved.status).toBe(WITHDRAWAL_STATUS.SUCCESS);
      expect(approved.cashfreeUtr).toBe('UTR987654321');

      wallet = await walletRepository.findByUserId(girl._id);
      expect(wallet.totalWithdrawnCoins).toBe(25);
      expect(wallet.totalWithdrawnRupees).toBe(1);
    });

    it('should automatically refund coins back to girl if admin rejects the request', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      const admin = await createUser({ role: USER_ROLE.ADMIN });

      await coinsService.creditCoins({
        userId: girl._id,
        gender: girl.gender,
        amount: 50,
        type: 'admin_credit',
      });

      const reqRes = await withdrawalService.requestWithdrawal({
        user: girl,
        coins: 50,
        payoutMethod: 'upi',
        upiId: 'invalid_upi@xyz',
      });

      let wallet = await walletRepository.findByUserId(girl._id);
      expect(wallet.coinBalance).toBe(0);

      // Admin rejects
      const rejected = await withdrawalService.rejectWithdrawal({
        withdrawalId: reqRes.withdrawal._id,
        adminUser: admin,
        reason: 'Invalid UPI ID',
      });

      expect(rejected.status).toBe(WITHDRAWAL_STATUS.REJECTED);
      expect(rejected.rejectionReason).toBe('Invalid UPI ID');

      // Coins refunded!
      wallet = await walletRepository.findByUserId(girl._id);
      expect(wallet.coinBalance).toBe(50);
    });

    it('should reject withdrawal if coin amount is below minimum threshold or insufficient balance', async () => {
      const girl = await createUser({ gender: GENDER.FEMALE });
      await coinsService.ensureWallet({ userId: girl._id, gender: girl.gender });

      await expect(
        withdrawalService.requestWithdrawal({
          user: girl,
          coins: 10, // below 25
          payoutMethod: 'upi',
          upiId: 'priya@okaxis',
        }),
      ).rejects.toThrow('Minimum withdrawal is 25 coins');

      await expect(
        withdrawalService.requestWithdrawal({
          user: girl,
          coins: 100, // balance is 0
          payoutMethod: 'upi',
          upiId: 'priya@okaxis',
        }),
      ).rejects.toThrow('You need at least 100 coins');
    });
  });
});
