// Short form cues per exercise, shown behind an (i). Standard coaching points,
// written here (no AI). First matching pattern wins, so specific names go first.

const TIPS: [RegExp, string][] = [
  // Cardio and finishers
  [/^zone 2/i, "Steady effort you could hold for an hour: breathing harder, but you can still talk in full sentences. Bike, rower, incline walk or easy jog all count. Can't talk? Slow down."],
  [/^intervals/i, "Warm up 5–10 min easy. Then 4 rounds of 4 min hard (only a few words at a time) and 3 min easy. Cool down. A bike or rower is easiest on the joints. Skip it if you're sick or very sore."],
  [/farmer'?s carry/i, "Pick the weights up like a deadlift, with a flat back. Stand tall, shoulders down, grip hard, and walk with short, quick steps for the time. Set them down the same way."],
  [/dead hang/i, "Overhand grip, arms straight, feet off the floor. Shoulders slightly pulled down, not shrugged up to your ears. Step down onto a box rather than dropping."],
  [/plank/i, "Elbows under shoulders, one straight line from head to heels. Squeeze your glutes and brace as if about to be punched. Stop the set when your hips start to sag."],

  // Lunges (before squats, so "split squat" lands here)
  [/bulgarian split squat/i, "Rear foot on the bench, laces down. Front foot far enough forward that its heel stays planted. Drop straight down until the back knee nearly touches the floor, then drive up through the front heel."],
  [/lunge/i, "Take a long step and lower until your back knee nearly touches the floor, front knee over your foot. Push back up through the front heel, torso upright."],

  // Squat pattern
  [/bodyweight squat/i, "Feet shoulder-width, arms out front for balance. Sit down between your heels as low as you can with your chest tall and heels flat, then stand up through the whole foot."],
  [/goblet squat/i, "Hold the weight at your chest, elbows down. Sit straight down between your heels until your elbows touch your knees, chest tall, heels flat. Stand up through the whole foot."],
  [/leg press/i, "Feet shoulder-width in the middle of the platform. Lower until your knees are near 90° without your lower back peeling off the pad. Don't lock your knees at the top."],
  [/squat$|smith machine squat|back squat/i, "Bar on your upper back, feet shoulder-width, toes slightly out. Brace, then sit down between your hips until your thighs are at least parallel, knees tracking over your toes. Drive up with your chest up. Set the rack safeties just below your bottom position."],

  // Hinge
  [/romanian deadlift|\brdl\b/i, "Start standing. Knees soft, push your hips back and slide the weight down your thighs with a flat back. Stop at a strong hamstring stretch (about mid-shin), then drive your hips forward."],
  [/deadlift/i, "Bar over mid-foot, shins close. Hinge down and grip just outside your legs, back flat, lats tight. Push the floor away, keeping the bar against your legs, and stand tall without leaning back. Lower it the same way."],
  [/kettlebell swing/i, "It's a hinge, not a squat. Hike the bell back between your legs, then snap your hips forward so it floats to chest height. Arms just hang on; squeeze your glutes at the top."],
  [/glute bridge/i, "Heel close to your glutes. Drive through it to lift your hips until knee, hip and shoulder line up. Pause at the top without arching your lower back."],
  [/pull-through/i, "Face away from the cable, rope between your legs. Push your hips back with a flat back, then stand up by squeezing your glutes. Arms stay straight."],
  [/sliding leg curl/i, "Lie on your back, heels on a towel, hips lifted in a bridge. Slide your heels in toward your glutes, keeping your hips up, then slowly slide back out."],
  [/band leg curl/i, "Lie face down with the band anchored low and looped around your ankles. Curl your heels toward your glutes with your hips pressed into the floor, then return slowly."],
  [/leg curl/i,"Pad just above your heels, knees lined up with the pivot. Curl all the way, then lower slowly (2–3 seconds). Keep your hips down."],
  [/calf raise/i, "Let your heels sink below the step for a full stretch, pause, then rise as high as you can onto your big toes. Lower slowly; don't bounce."],

  // Push
  [/diamond push-up/i, "Hands together under your chest, body in a straight plank. Lower with your elbows close to your sides, then press back up. Too hard? Do it from your knees."],
  [/pike push-up/i, "Hips high so your body makes an upside-down V. Bend your elbows to lower the top of your head toward the floor between your hands, then press back up."],
  [/push-up/i, "Hands under your shoulders, body a straight plank with glutes squeezed. Lower your chest to just above the floor, elbows about 45° from your sides, then push away. Too hard? Put your hands on a bench."],
  [/incline (dumbbell )?(bench )?press/i, "Bench at 30–45°. Shoulder blades pinched back and down. Lower to your upper chest with elbows about 45° from your sides, then press up. Use a spotter or safeties with a barbell."],
  [/dumbbell (bench|floor) press/i, "Shoulder blades pinched back and down, feet planted. Lower the dumbbells to chest level, elbows about 45° from your sides, then press up until they nearly touch."],
  [/bench press/i, "Eyes under the bar, shoulder blades pinched and down, feet planted. Lower to your lower chest with elbows about 45° from your sides, touch, and press up and slightly back. Thumbs wrapped around the bar; use a spotter or safety arms."],
  [/chest press/i, "Handles at mid-chest, shoulder blades back against the pad. Press out without locking your elbows hard, then return slowly until you feel a chest stretch."],
  [/cable fly/i, "Slight bend in your elbows, kept fixed. Open your arms wide until you feel a chest stretch, then bring your hands together as if hugging a barrel."],
  [/\bdips?\b/i, "Lean slightly forward and lower until your upper arms are about parallel to the floor, then press up. Stop short of any shoulder pinch."],
  [/^overhead press|military press|^ohp/i, "Bar at your collarbone, grip just outside your shoulders, glutes squeezed and core braced. Press straight up, moving your head back and then through once the bar passes. Don't lean back."],
  [/(shoulder|kettlebell|overhead) press/i, "Brace with your ribs down and press overhead without arching your lower back. Lower to about ear level with control."],

  // Pull
  [/inverted row/i, "Body straight from heels to head. Pull your chest to the bar (or table edge) and squeeze your shoulder blades together. Bend your knees to make it easier. Make sure a table can take your weight first."],
  [/one-arm dumbbell row|dumbbell row/i, "One hand and knee on the bench, back flat. Pull the dumbbell toward your hip (elbow back, not out), pause, then lower to a full stretch."],
  [/barbell row|^rows?$/i, "Hinge to about 45° with a flat back, bar hanging at your knees. Row to your lower ribs, elbows back, then lower under control. Your torso stays still."],
  [/(cable|band) row/i, "Sit or stand tall, chest up. Pull the handle to your belly and squeeze your shoulder blades together without rocking back."],
  [/chin-up/i, "Palms facing you. Start from a full hang with your shoulders pulled down, pull until your chin clears the bar, and lower all the way. Can't do one yet? Use a band or slow 5-second lowerings."],
  [/pull-up/i, "Palms facing away. Start from a full hang with your shoulders pulled down, pull until your chin clears the bar, and lower all the way. Can't do one yet? Use a band or slow 5-second lowerings."],
  [/pulldown/i, "Grip just wider than your shoulders and lean back slightly. Drive your elbows down to bring the bar to your upper chest, then let it up under control."],
  [/pullover/i, "Lie on the bench holding one dumbbell over your chest, elbows slightly bent. Lower it behind your head until your lats stretch, then pull it back over your chest."],

  // Shoulders and arms
  [/lateral raise/i, "Slight bend in your elbows. Raise your arms out to shoulder height, leading with your elbows, then lower slowly. Go light; swinging means it's too heavy."],
  [/face pull/i, "Rope at face height. Pull it toward your forehead with your hands splitting apart, ending in a double-biceps pose. Squeeze the back of your shoulders."],
  [/rear delt fly/i, "Hinge forward with a flat back, elbows slightly bent. Raise your arms out to the sides, squeezing the back of your shoulders, then lower slowly."],
  [/curl/i, "Elbows pinned at your sides. Curl without swinging your body, then lower slowly all the way to straight arms."],
  [/triceps pushdown/i, "Elbows pinned to your sides. Push down until your arms are straight, then let the handle come back up to about 90° under control."],
  [/triceps extension/i, "Hold one dumbbell overhead with both hands, elbows pointing forward. Lower it behind your head, then straighten your arms fully. Keep your ribs down."],

  // Core
  [/leg raise/i, "Hang with your shoulders engaged, not shrugged. Raise your knees (or straight legs) by curling your pelvis up, then lower slowly without swinging."],
  [/crunch/i, "Kneel with the rope beside your head. Curl your ribs down toward your hips, keeping your hips still, then return slowly."],
];

export function formTip(exercise: string): string | null {
  const name = exercise.trim();
  return TIPS.find(([re]) => re.test(name))?.[1] ?? null;
}
