import { referralService } from '#src/modules/referrals/referral.service.js';

/** GET /referrals/my-code */
export async function getMyCode(req, res) {
  const result = await referralService.getMyCode(req.user.id);
  res.json({ data: result });
}

/** GET /referrals/stats */
export async function getMyStats(req, res) {
  const stats = await referralService.getMyStats(req.user.id);
  res.json({ data: stats });
}

/** GET /referrals/history */
export async function getMyHistory(req, res) {
  const result = await referralService.getMyHistory(req.user.id, req.query);
  res.json(result);
}

/** Admin: GET /referrals/admin/list */
export async function adminListAll(req, res) {
  const result = await referralService.adminListAll(req.query);
  res.json(result);
}

/** Admin: GET /referrals/admin/stats */
export async function adminGlobalStats(req, res) {
  const stats = await referralService.adminGlobalStats();
  res.json({ data: stats });
}
