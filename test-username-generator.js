/**
 * Test script for username generator
 * Run: node test-username-generator.js
 */

const { generateUsernames, generateEmail, extractNames } = require('./username-generator');

// Sample family data (mimicking Supabase record)
const testFamilies = [
  {
    id: 1,
    name: 'Fatima Al-Hassan',
    proxy_city: 'quebec',
    children_details: JSON.stringify([
      { name: 'Ubay', age: 8, gender: 'male' },
      { name: 'Sila', age: 5, gender: 'female' },
      { name: 'Ahmad', age: 12, gender: 'male' }
    ])
  },
  {
    id: 2,
    name: 'Mariam Abu-Zahra',
    proxy_city: 'chicago',
    children_details: JSON.stringify([
      { name: 'Rana', age: 7, gender: 'female' }
    ])
  },
  {
    id: 3,
    name: 'Layla Mahmoud',
    proxy_city: 'sarajevo',
    children_details: null // No children details
  },
  {
    id: 4,
    name: 'Nour Al-Din',
    proxy_city: 'sanfrancisco',
    children_details: JSON.stringify([
      { name: 'Yasmin', age: 10, gender: 'female' },
      { name: 'Omar', age: 6, gender: 'male' }
    ])
  }
];

console.log('='.repeat(60));
console.log('INSTAGRAM USERNAME GENERATOR TEST');
console.log('='.repeat(60));

testFamilies.forEach(family => {
  console.log(`\n--- Family: ${family.name} (${family.proxy_city}) ---`);

  // Extract names
  const names = extractNames(family);
  console.log(`Extracted names: ${names.length > 0 ? names.join(', ') : '(none)'}`);

  // Generate usernames
  const usernames = generateUsernames(family, 4);
  console.log('Username suggestions:');
  usernames.forEach((u, i) => console.log(`  ${i + 1}. @${u}`));

  // Generate email
  const email = generateEmail(family.proxy_city);
  console.log(`Email suggestion: ${email.email}`);
  console.log(`  Name: ${email.firstName} ${email.surname} (born ${email.birthYear})`);
});

console.log('\n' + '='.repeat(60));
console.log('Additional random samples (no family data):');
console.log('='.repeat(60));

// Generate some without family data to show generic patterns
const genericFamily = { name: '', children_details: null };
for (let i = 0; i < 3; i++) {
  const usernames = generateUsernames(genericFamily, 4);
  console.log(`\nBatch ${i + 1}:`);
  usernames.forEach((u, j) => console.log(`  ${j + 1}. @${u}`));
}

console.log('\n' + '='.repeat(60));
console.log('Email samples by city:');
console.log('='.repeat(60));

['quebec', 'chicago', 'sanfrancisco', 'sarajevo'].forEach(city => {
  console.log(`\n${city.toUpperCase()}:`);
  for (let i = 0; i < 2; i++) {
    const email = generateEmail(city);
    console.log(`  ${email.email}`);
  }
});

console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60));
