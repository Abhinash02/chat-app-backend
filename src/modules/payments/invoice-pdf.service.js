import PDFDocument from 'pdfkit';
import { v2 as cloudinary } from 'cloudinary';

import { env } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { localStorageProvider } from '#src/integrations/storage/local.storage.js';
import { paymentRepository } from '#src/modules/payments/payment.repository.js';
import { userRepository } from '#src/modules/users/user.repository.js';
import { settingsService } from '#src/modules/settings/settings.service.js';

let cloudinaryConfigured = false;
function initCloudinary() {
  if (cloudinaryConfigured) return true;
  if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    cloudinaryConfigured = true;
    return true;
  }
  return false;
}

/**
 * Builds a PDF document buffer for a payment order using PDFKit.
 */
export async function generateInvoicePdfBuffer(order, orderUser, settings) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      compress: true,
      info: {
        Title: `Tax Invoice - ${order._id}`,
        Author: 'Vibe Chat',
      },
    });
    const buffers = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));

    const brandColor = '#4F46E5';
    const darkColor = '#0F172A';
    const grayColor = '#64748B';
    const lightBg = '#F8FAFC';
    const greenColor = '#16A34A';

    const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const invoiceNum = `INV-${String(order._id).slice(-8).toUpperCase()}`;
    const amountInRupees = (order.amountInPaise / 100).toFixed(2);
    const coinsCredited = (order.coins || 0) + (order.bonusCoins || 0);
    const isPaid = order.status === 'paid';
    const statusText = isPaid ? 'PAID / COMPLETED' : order.status.toUpperCase();
    const txnId = order.providerPaymentId || order.providerOrderId || String(order._id);

    // --- Header Background ---
    doc.rect(0, 0, doc.page.width, 110).fill(brandColor);

    // App Name & Tagline
    doc.fillColor('#FFFFFF').fontSize(24).font('Helvetica-Bold').text('VIBE CHAT', 40, 35);
    doc.fontSize(10).font('Helvetica').text('Premium Social & Real-Time Chat Platform', 40, 68);

    // Invoice Title & Status in Header
    doc.fontSize(18).font('Helvetica-Bold').text('TAX INVOICE', 350, 35, { align: 'right', width: 200 });
    doc.fontSize(10).font('Helvetica').text(invoiceNum, 350, 60, { align: 'right', width: 200 });
    doc.fillColor(isPaid ? '#BBF7D0' : '#FEF08A').fontSize(10).font('Helvetica-Bold').text(statusText, 350, 78, { align: 'right', width: 200 });

    doc.y = 135;

    // --- Two Columns: Billed To & Order Details ---
    const colWidth = 240;
    const col1X = 40;
    const col2X = 310;
    const topBoxY = 135;

    // Box 1: Billed To
    doc.rect(col1X, topBoxY, colWidth, 100).fillAndStroke(lightBg, '#E2E8F0');
    doc.fillColor(grayColor).fontSize(9).font('Helvetica-Bold').text('BILLED TO', col1X + 14, topBoxY + 12);
    doc.fillColor(darkColor).fontSize(12).font('Helvetica-Bold').text(orderUser?.name || orderUser?.nickname || 'Vibe User', col1X + 14, topBoxY + 28);
    doc.fillColor(grayColor).fontSize(9).font('Helvetica').text(`Email: ${orderUser?.email || 'user@vibechat.app'}`, col1X + 14, topBoxY + 46);
    doc.fontSize(9).text(`User ID: ${String(order.userId)}`, col1X + 14, topBoxY + 62);
    doc.fontSize(9).text(`Country: India (INR)`, col1X + 14, topBoxY + 78);

    // Box 2: Payment Details
    doc.rect(col2X, topBoxY, colWidth, 100).fillAndStroke(lightBg, '#E2E8F0');
    doc.fillColor(grayColor).fontSize(9).font('Helvetica-Bold').text('PAYMENT DETAILS', col2X + 14, topBoxY + 12);
    doc.fillColor(darkColor).fontSize(10).font('Helvetica').text(`Date: ${formattedDate}`, col2X + 14, topBoxY + 28);
    doc.fontSize(10).text(`Gateway: ${(order.provider || 'CASHFREE').toUpperCase()}`, col2X + 14, topBoxY + 46);
    doc.fontSize(9).text(`Txn / Ref: ${txnId.slice(0, 24)}`, col2X + 14, topBoxY + 64);
    doc.fontSize(9).text(`Order Ref: ${String(order._id)}`, col2X + 14, topBoxY + 80);

    // --- Table Header ---
    const tableTop = 260;
    doc.rect(40, tableTop, 515, 26).fill('#F1F5F9');
    doc.fillColor('#475569').fontSize(9).font('Helvetica-Bold');
    doc.text('ITEM / DESCRIPTION', 52, tableTop + 8);
    doc.text('QTY / COINS', 280, tableTop + 8, { width: 100, align: 'center' });
    doc.text('PRICE', 390, tableTop + 8, { width: 70, align: 'right' });
    doc.text('AMOUNT (INR)', 470, tableTop + 8, { width: 75, align: 'right' });

    // Table Row
    const rowTop = tableTop + 30;
    doc.rect(40, rowTop, 515, 45).fillAndStroke('#FFFFFF', '#E2E8F0');
    doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold');
    doc.text(order.packageName || 'Coin Pack Bundle', 52, rowTop + 10);
    doc.fillColor(grayColor).fontSize(8).font('Helvetica').text(`In-App Coins Credit (Non-expiring)`, 52, rowTop + 24);

    doc.fillColor(brandColor).fontSize(10).font('Helvetica-Bold').text(`+${coinsCredited.toLocaleString('en-IN')} Coins`, 280, rowTop + 14, { width: 100, align: 'center' });
    doc.fillColor(darkColor).fontSize(10).font('Helvetica').text(`Rs ${amountInRupees}`, 390, rowTop + 14, { width: 70, align: 'right' });
    doc.fontSize(10).font('Helvetica-Bold').text(`Rs ${amountInRupees}`, 470, rowTop + 14, { width: 75, align: 'right' });

    // --- Totals Section ---
    const totalY = rowTop + 65;
    const totalBoxX = 330;
    const totalBoxW = 225;

    doc.fillColor(grayColor).fontSize(9).font('Helvetica');
    doc.text('Subtotal:', totalBoxX, totalY);
    doc.text(`Rs ${amountInRupees}`, totalBoxX + 110, totalY, { width: 110, align: 'right' });

    doc.text('Estimated GST (18% incl.):', totalBoxX, totalY + 16);
    const taxAmt = ((order.amountInPaise / 100) * 0.18 / 1.18).toFixed(2);
    doc.text(`Rs ${taxAmt}`, totalBoxX + 110, totalY + 16, { width: 110, align: 'right' });

    doc.rect(totalBoxX, totalY + 36, totalBoxW, 1).fill('#CBD5E1');

    doc.fillColor(darkColor).fontSize(13).font('Helvetica-Bold');
    doc.text('Grand Total:', totalBoxX, totalY + 44);
    doc.fillColor(greenColor).text(`Rs ${amountInRupees}`, totalBoxX + 100, totalY + 44, { width: 120, align: 'right' });

    // --- Security & Policy Box ---
    const infoY = totalY + 95;
    doc.rect(40, infoY, 515, 60).fillAndStroke('#F0FDF4', '#BBF7D0');
    doc.fillColor(greenColor).fontSize(9).font('Helvetica-Bold').text('Verified Payment Receipt', 54, infoY + 10);
    doc.fillColor('#166534').fontSize(8).font('Helvetica').text(
      'Coins are immediately added to your Vibe Chat wallet and never expire. You can view your balance and coin transactions history in your profile anytime.',
      54,
      infoY + 24,
      { width: 485, lineGap: 2 }
    );

    // --- Footer ---
    doc.rect(40, 720, 515, 1).fill('#E2E8F0');
    doc.fillColor(grayColor).fontSize(8).font('Helvetica').text(
      `Support Email: ${settings?.payments?.supportEmail || 'support@vibechat.app'}  •  Website: https://vibechat.app`,
      40,
      730,
      { align: 'center', width: 515 }
    );
    doc.fontSize(7).text('This is a computer-generated tax invoice. No physical signature is required.', 40, 744, {
      align: 'center',
      width: 515,
    });

    doc.end();
  });
}

import { NotFoundError, ForbiddenError } from '#src/common/errors/index.js';

/**
 * Generates PDF and uploads to Cloudinary.
 * If Cloudinary is not configured, saves locally or provides the server download URL.
 * Updates order with invoiceUrl and invoicePublicId.
 */
export async function generateAndSaveOrderInvoicePdf(orderId, user = null) {
  const order = await paymentRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found', 'ORDER_NOT_FOUND');

  if (user && user.role !== 'admin' && String(order.userId) !== String(user.id)) {
    throw new ForbiddenError('You can only download invoices for your own orders', 'FORBIDDEN');
  }

  // If already uploaded to Cloudinary, return the existing url
  if (order.invoiceUrl && order.invoiceUrl.startsWith('http')) {
    return { invoiceUrl: order.invoiceUrl, isNew: false };
  }

  const orderUser = await userRepository.findById(order.userId);
  const settings = await settingsService.getSettings();

  const pdfBuffer = await generateInvoicePdfBuffer(order, orderUser, settings);
  const fileName = `invoice-${order._id}`;
  let invoiceUrl = null;
  let invoicePublicId = null;

  const hasCloudinary = initCloudinary();

  if (hasCloudinary) {
    try {
      const publicId = `invoices/${fileName}-${Date.now()}`;
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `${env.CLOUDINARY_FOLDER || 'vibechat'}/invoices`,
            public_id: `${fileName}-${Date.now()}`,
            resource_type: 'raw', // PDF raw document
            format: 'pdf',
            overwrite: true,
          },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(pdfBuffer);
      });

      invoiceUrl = uploadResult.secure_url || uploadResult.url;
      invoicePublicId = uploadResult.public_id;
      logger.info({ orderId: String(order._id), invoiceUrl }, 'Invoice PDF uploaded to Cloudinary successfully');
    } catch (err) {
      logger.warn({ err, orderId: String(order._id) }, 'Failed to upload PDF invoice to Cloudinary, falling back to local');
    }
  }

  if (!invoiceUrl) {
    const localUpload = await localStorageProvider.upload({
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
      folder: 'invoices',
      fileName,
    });
    invoiceUrl = localUpload.url;
    invoicePublicId = localUpload.key;
  }

  await paymentRepository.updateById(order._id, {
    $set: {
      invoiceUrl,
      invoicePublicId,
    },
  });

  return { invoiceUrl, pdfBuffer, isNew: true };
}
