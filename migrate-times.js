const admin = require('firebase-admin');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccountKey.json';

try {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });
} catch (err) {
  console.error('Failed to initialize Firebase Admin SDK:', err.message);
  process.exit(1);
}

const db = admin.firestore();

const timeToMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

async function migrate() {
  const snapshot = await db.collection('schedules').get();
  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();
    let changed = false;
    const availability = {};

    Object.entries(data.candidateAvailability || {}).forEach(([date, times]) => {
      availability[date] = times.map(t => {
        if (typeof t === 'number') return t;
        changed = true;
        return timeToMinutes(t);
      });
    });

    let bookedSlot = data.bookedSlot;
    if (bookedSlot && typeof bookedSlot.time === 'string') {
      bookedSlot = { ...bookedSlot, time: timeToMinutes(bookedSlot.time) };
      changed = true;
    }

    if (changed) {
      batch.update(doc.ref, {
        candidateAvailability: availability,
        ...(bookedSlot ? { bookedSlot } : {})
      });
    }
  });

  if (!batch._ops || batch._ops.length === 0) {
    console.log('No documents required migration.');
    return;
  }

  await batch.commit();
  console.log('Migration complete.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
