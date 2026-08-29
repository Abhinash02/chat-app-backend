import { beforeEach, describe, expect, it } from 'vitest';

import { GENDER } from '#src/common/constants/index.js';
import { PaymentRequiredError } from '#src/common/errors/index.js';
import { BILLING_OUTCOME, COIN_TRANSACTION_TYPE } from '#src/modules/coins/coins.constants.js';
import { coinsService } from '#src/modules/coins/coins.service.js';
import { walletRepository } from '#src/modules/coins/wallet.repository.js';
import { coinTransactionRepository } from '#src/modules/coins/coin-transaction.repository.js';
import { applySettings, createUser, resetDatabase } from '../helpers/factories.js';

/** Sends `count` messages and returns the outcome of each. */
async function sendMessages(user, count) {
  const outcomes = [];

  for (let index = 0; index < count; index += 1) {
    const result = await coinsService.authorizeMessage({
      userId: user._id,
      gender: user.gender,
      conversationId: null,
    });
    outcomes.push(result.outcome);
  }

  return outcomes;
}

describe('coin billing engine', () => {
  beforeEach(async () => {
    await resetDatabase();
    // Start every case with the free allowance switched off, so the
    // pay-per-block rules are what is under test.
    await applySettings({ coins: { freeTalkMinutes: 0 } });
  });

  describe('gender rules', () => {
    it('should never charge a female account, however many messages she sends', async () => {
      const user = await createUser({ gender: GENDER.FEMALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });

      const outcomes = await sendMessages(user, 30);

      expect(new Set(outcomes)).toEqual(new Set([BILLING_OUTCOME.FREE_GENDER]));

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(0);
      expect(wallet.totalSpentCoins).toBe(0);
    });

    it('should give a female account no free-talk allowance, because she never needs one', async () => {
      await applySettings({ coins: { freeTalkMinutes: 30 } });
      const user = await createUser({ gender: GENDER.FEMALE });

      const wallet = await coinsService.ensureWallet({ userId: user._id, gender: user.gender });

      expect(wallet.freeTalkSecondsRemaining).toBe(0);
    });
  });

  describe('free talk allowance', () => {
    it('should let a male account chat free while the allowance lasts', async () => {
      await applySettings({ coins: { freeTalkMinutes: 30 } });
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });

      const outcomes = await sendMessages(user, 20);

      expect(new Set(outcomes)).toEqual(new Set([BILLING_OUTCOME.FREE_TALK]));

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(0);
    });

    it('should seed exactly the configured number of free minutes', async () => {
      await applySettings({ coins: { freeTalkMinutes: 30 } });
      const user = await createUser({ gender: GENDER.MALE });

      const wallet = await coinsService.ensureWallet({ userId: user._id, gender: user.gender });

      expect(wallet.freeTalkSecondsRemaining).toBe(30 * 60);
    });

    it('should burn the allowance as chat heartbeats arrive', async () => {
      await applySettings({ coins: { freeTalkMinutes: 1 } });
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });

      await coinsService.consumeFreeTalk({ userId: user._id, gender: user.gender, seconds: 15 });

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.freeTalkSecondsRemaining).toBe(45);
    });

    it('should clamp the allowance at zero rather than going negative', async () => {
      await applySettings({ coins: { freeTalkMinutes: 1 } });
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });

      await coinsService.consumeFreeTalk({ userId: user._id, gender: user.gender, seconds: 5000 });

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.freeTalkSecondsRemaining).toBe(0);
    });

    it('should start charging once the allowance is exhausted', async () => {
      await applySettings({ coins: { freeTalkMinutes: 1 } });
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 10,
        type: COIN_TRANSACTION_TYPE.ADMIN_CREDIT,
      });

      expect((await sendMessages(user, 1))[0]).toBe(BILLING_OUTCOME.FREE_TALK);

      await coinsService.consumeFreeTalk({ userId: user._id, gender: user.gender, seconds: 60 });

      expect((await sendMessages(user, 1))[0]).toBe(BILLING_OUTCOME.BLOCK_PURCHASED);
    });
  });

  describe('7 messages per 10 coins', () => {
    it('should charge 10 coins on the first message and cover the next six', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 60,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });

      const outcomes = await sendMessages(user, 7);

      expect(outcomes[0]).toBe(BILLING_OUTCOME.BLOCK_PURCHASED);
      expect(outcomes.slice(1)).toEqual(Array(6).fill(BILLING_OUTCOME.PREPAID_BLOCK));

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(50);
      expect(wallet.messageCredits).toBe(0);
    });

    it('should charge again on the eighth message', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 60,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });

      const outcomes = await sendMessages(user, 8);

      expect(outcomes[7]).toBe(BILLING_OUTCOME.BLOCK_PURCHASED);
      expect((await walletRepository.findByUserId(user._id)).coinBalance).toBe(40);
    });

    it('should spend exactly 60 coins over 42 messages', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 60,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });

      await sendMessages(user, 42);

      const wallet = await walletRepository.findByUserId(user._id);
      expect(wallet.coinBalance).toBe(0);
      expect(wallet.totalSpentCoins).toBe(60);
      expect(wallet.lifetimeBilledMessages).toBe(42);
    });

    it('should refuse the message that cannot be paid for', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 10,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });

      await sendMessages(user, 7);

      await expect(
        coinsService.authorizeMessage({ userId: user._id, gender: user.gender }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS', statusCode: 402 });
    });

    it('should refuse a message when the balance is short of a full block', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 9,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });

      await expect(
        coinsService.authorizeMessage({ userId: user._id, gender: user.gender }),
      ).rejects.toBeInstanceOf(PaymentRequiredError);

      // The failed attempt must not have taken any coins.
      expect((await walletRepository.findByUserId(user._id)).coinBalance).toBe(9);
    });

    it('should honour admin-changed pricing without a code change', async () => {
      await applySettings({ coins: { messagesPerBlock: 3, coinsPerBlock: 5 } });

      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 10,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });

      const outcomes = await sendMessages(user, 4);

      expect(outcomes).toEqual([
        BILLING_OUTCOME.BLOCK_PURCHASED,
        BILLING_OUTCOME.PREPAID_BLOCK,
        BILLING_OUTCOME.PREPAID_BLOCK,
        BILLING_OUTCOME.BLOCK_PURCHASED,
      ]);
      expect((await walletRepository.findByUserId(user._id)).coinBalance).toBe(0);
    });

    it('should not let two concurrent sends spend the same coins twice', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 10,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          coinsService.authorizeMessage({ userId: user._id, gender: user.gender }),
        ),
      );

      const purchased = results.filter(
        (result) =>
          result.status === 'fulfilled' && result.value.outcome === BILLING_OUTCOME.BLOCK_PURCHASED,
      );

      // Exactly one of the racing sends may buy the single affordable block.
      expect(purchased).toHaveLength(1);
      expect((await walletRepository.findByUserId(user._id)).coinBalance).toBe(0);
    });

    it('should write one ledger entry per block purchased, not per message', async () => {
      const user = await createUser({ gender: GENDER.MALE });
      await coinsService.ensureWallet({ userId: user._id, gender: user.gender });
      await coinsService.creditCoins({
        userId: user._id,
        gender: user.gender,
        amount: 20,
        type: COIN_TRANSACTION_TYPE.PURCHASE,
      });

      await sendMessages(user, 14);

      const { items } = await coinTransactionRepository.listByUser({
        userId: user._id,
        type: COIN_TRANSACTION_TYPE.MESSAGE_CHARGE,
      });

      expect(items).toHaveLength(2);
      expect(items.every((entry) => entry.amount === 10)).toBe(true);
      expect(items[0].balanceAfter).toBe(0);
    });
  });
});
