import { sendCreatorOutreach } from './src/lib/resend';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
async function run() {
  console.log('🚀 Sending test email...');
  const result = await sendCreatorOutreach({
    creatorEmail: 'greenlight.adv1@gmail.com',
    creatorName: 'أيمن',
    campaignTitle: 'حملة إعلانية تجريبية - Green Light',
    offerAmount: '',
    pitchDescription: 'اختبار محرك الإرسال وقوالب البريد الإلكتروني المباشر.',
    ctaUrl: 'https://greenlight.com',
  });
  console.log('✉️ Result:', JSON.stringify(result, null, 2));
}
run();
