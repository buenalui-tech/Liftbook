// Supabase project settings for cloud sync.
// Paste the Project URL and the publishable (anon) key from Supabase: Project Settings → API.
// Both are meant to be public. Row-level security in supabase/setup.sql keeps each person's log private.
// Leave them empty and Liftbook runs without cloud sync, saving on the device only.
window.LIFTBOOK_CONFIG = {
  supabaseUrl: 'https://obexhwzhzumpgnlyuxav.supabase.co',
  supabaseAnonKey: 'sb_publishable_Oyy-GVETSgir4iBLj0aaeg_70MjHECm',
  // USDA FoodData Central key (free, https://fdc.nal.usda.gov/api-key-signup). It only meters searches.
  usdaApiKey: 'eLeEhc2prwQXEpM1dbNy9s21DMturN6SWMWLzCzy'
};
