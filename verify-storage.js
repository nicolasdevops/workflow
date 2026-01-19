/**
 * Verify Storage Script
 * Lists all files currently stored in the 'media' bucket
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listFiles() {
  console.log('🔍 Checking "media" bucket for uploads...\n');
  
  // List folders/files in the root of the bucket
  const { data: rootItems, error } = await supabase.storage.from('media').list();
  
  if (error) {
    console.error('❌ Error accessing bucket:', error.message);
    return;
  }
  
  if (!rootItems || rootItems.length === 0) {
    console.log('   (Bucket is empty)');
    return;
  }
  
  for (const item of rootItems) {
    if (!item.id) { 
      // It's a folder (User's folder)
      console.log(`📁 User Folder: ${item.name}`);
      
      // List files inside this folder
      const { data: files } = await supabase.storage.from('media').list(item.name);
      
      if (files && files.length > 0) {
        files.forEach(f => {
          const sizeKB = (f.metadata.size / 1024).toFixed(1);
          console.log(`   └─ 📄 ${f.name} (${sizeKB} KB) - ${new Date(f.created_at).toLocaleString()}`);
        });
      } else {
        console.log('   └─ (Empty)');
      }
    } else {
      // It's a file in the root
      console.log(`📄 Root File: ${item.name} (${(item.metadata.size / 1024).toFixed(1)} KB)`);
    }
  }
  console.log('\n✅ Verification complete.');
}

listFiles().catch(console.error);