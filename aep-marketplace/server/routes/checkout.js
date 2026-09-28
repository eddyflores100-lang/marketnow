import { Router } from 'express';
import { readDB, writeDB } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// POST /api/checkout/create-session — Stripe Checkout session (with fallback to simulated purchase)
router.post('/create-session', authenticateToken, async (req, res) => {
  try {
    const { skillId } = req.body;

    if (!skillId) {
      return res.status(400).json({ error: 'skillId required' });
    }

    const db = readDB();
    const skill = db.skills.find(s => s.id === skillId);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Try Stripe if key is set
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && stripeKey.startsWith('sk_')) {
      try {
        const stripe = await import('stripe').then(m => m.default(stripeKey));
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: skill.name,
                description: skill.description,
              },
              unit_amount: Math.round(skill.price * 100),
            },
            quantity: 1,
          }],
          mode: 'payment',
          success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/vault?success=true&skillId=${skillId}`,
          cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/skill/${skillId}?canceled=true`,
          metadata: { skillId, userId: req.user.id },
        });

        return res.json({ url: session.url, sessionId: session.id });
      } catch (stripeErr) {
        // F-12 hardening 2026-09-28: un error de Stripe NUNCA debe degradar a
        // "compra simulada" — eso regala licencias en un outage. El fallback
        // simulado queda exclusivamente para desarrollo local, detras de un
        // env flag explícito (default OFF).
        console.error('Stripe error:', stripeErr.message);
        if (process.env.ENABLE_SIMULATED_PURCHASES !== 'true') {
          return res.status(502).json({
            error: 'Payment provider error',
            message: 'Stripe checkout failed. No purchase was recorded — please retry.',
          });
        }
        console.error('Falling back to SIMULATED purchase (ENABLE_SIMULATED_PURCHASES=true)');
        // Fall through to simulated purchase (dev mode only)
      }
    }

    // Simulated purchase (dev only — requires ENABLE_SIMULATED_PURCHASES=true)
    if (process.env.ENABLE_SIMULATED_PURCHASES !== 'true') {
      return res.status(503).json({
        error: 'Payments not configured',
        message: 'STRIPE_SECRET_KEY is not set and simulated purchases are disabled.',
      });
    }
    const purchase = {
      id: `pur_${Date.now()}`,
      userId: req.user.id,
      skillId: skill.id,
      skillName: skill.name,
      price: skill.price,
      license: `AEP-LIC-${skill.id.slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      purchasedAt: new Date().toISOString(),
      status: 'Active'
    };

    db.purchases.push(purchase);
    writeDB(db);

    res.json({
      success: true,
      purchase,
      message: `Successfully purchased ${skill.name}! License: ${purchase.license}`
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
