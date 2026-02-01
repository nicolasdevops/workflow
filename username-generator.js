/**
 * Instagram Username Generator for Gaza Families
 *
 * Generates poetic, peaceful usernames that:
 * - Use Middle Eastern themes (olive, palm, peace, love)
 * - Incorporate actual family member names
 * - Avoid "gaza", "palestine", "refugee" keywords
 * - Feel authentic to a Gazan mother/child's voice
 */

// Word banks - raw, biblical, Gazan
const WORDS = {
  trees: ['olive', 'palm', 'fig', 'pomegranate', 'citrus', 'almond', 'flower', 'tree', 'rose'],
  reality: ['dust', 'stone', 'rubble', 'wall', 'door', 'key', 'roof', 'bread', 'water', 'salt'],
  sky: ['sky', 'bird', 'cloud', 'star', 'moon', 'sun'],
  body: ['hands', 'heart', 'hearts', 'tears', 'eyes', 'wound', 'scar', 'small', 'little', 'smile'],
  family: ['child', 'mother', 'father', 'brother', 'sister', 'uncle', 'family'],
  state: ['waiting', 'alone', 'together', 'still', 'quiet', 'broken', 'dry', 'old', 'ancient', 'lost', 'missing'],
  feeling: ['love', 'peace'],
  verbs: ['hold', 'remember', 'drying', 'growing', 'waiting', 'walking', 'running', 'praying', 'cooking']
};

// All words flattened for random picking
// Exclude 'small' and 'little' from nouns (they're adjectives only)
const PURE_NOUNS = [...WORDS.trees, ...WORDS.reality, ...WORDS.sky, ...WORDS.feeling,
  'hands', 'heart', 'hearts', 'tears', 'eyes', 'wound', 'scar', 'smile'];
const ALL_ADJECTIVES = ['little', 'small', 'old', 'ancient', 'dry', 'broken', 'quiet', 'still'];
const ALL_ACTIONS = WORDS.verbs;
const RELATIONS = WORDS.family;

/**
 * Pick random item from array
 */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate random number suffix (1-4 digits, not always round)
 */
function randomSuffix() {
  const digits = Math.floor(Math.random() * 4) + 1; // 1-4 digits
  if (digits === 1) return Math.floor(Math.random() * 10).toString();
  if (digits === 2) return Math.floor(Math.random() * 90 + 10).toString();
  if (digits === 3) return Math.floor(Math.random() * 900 + 100).toString();
  return Math.floor(Math.random() * 9000 + 1000).toString();
}

/**
 * Clean name for Instagram (lowercase, remove diacritics, only letters)
 */
function cleanName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z]/g, ''); // Only letters
}

/**
 * Pattern generators
 */
const PATTERNS = {
  // walkingwithsila, cookingwithubay, runningwithfather
  actionWithName: (name) => {
    const action = pick(ALL_ACTIONS);
    return `${action}with${name}`;
  },

  // smileformother, walkingforfather, prayingforuncle
  actionForRelation: () => {
    const action = pick(ALL_ACTIONS);
    const relation = pick(RELATIONS);
    return `${action}for${relation}`;
  },

  // holdmyheart, drymytears
  actionMyNoun: () => {
    const action = pick(ALL_ACTIONS);
    const noun = pick(PURE_NOUNS);
    return `${action}my${noun}`;
  },

  // littlebirdubay, smallstarrana
  adjNounName: (name) => {
    const adj = pick(ALL_ADJECTIVES);
    const noun = pick([...WORDS.sky, ...WORDS.trees, 'heart', 'star', 'bird', 'flower']);
    return `${adj}${noun}${name}`;
  },

  // tearsofubay, smileofsilaa
  nounOfName: (name) => {
    const noun = pick(['tears', 'smile', 'heart', 'hands', 'eyes', 'love', 'peace']);
    return `${noun}of${name}`;
  },

  // olivetears47, palmheart223
  nounNounNumber: () => {
    const noun1 = pick(WORDS.trees);
    const noun2 = pick(['tears', 'heart', 'peace', 'love', 'hands', 'smile']);
    return `${noun1}${noun2}${randomSuffix()}`;
  },

  // myheartmypeace54
  myNounMyNoun: () => {
    const noun1 = pick(['heart', 'hands', 'tears', 'love']);
    const noun2 = pick(['peace', 'hope', 'love', 'smile']);
    return `my${noun1}my${noun2}${randomSuffix()}`;
  }
};

/**
 * Extract usable names from family data
 * @param {Object} familyData - Family record from Supabase
 * @returns {string[]} Array of cleaned first names
 */
function extractNames(familyData) {
  const names = [];

  // Try to parse children_details if it exists
  if (familyData.children_details) {
    let children = familyData.children_details;

    // Parse if string
    if (typeof children === 'string') {
      try {
        children = JSON.parse(children);
      } catch (e) {
        children = [];
      }
    }

    // Extract names from children array
    if (Array.isArray(children)) {
      children.forEach(child => {
        if (child.name) {
          const cleaned = cleanName(child.name.split(' ')[0]); // First name only
          if (cleaned && cleaned.length >= 3) {
            names.push(cleaned);
          }
        }
      });
    }
  }

  // Try family name as fallback (first name of parent)
  if (familyData.name) {
    const cleaned = cleanName(familyData.name.split(' ')[0]);
    if (cleaned && cleaned.length >= 3) {
      names.push(cleaned);
    }
  }

  return names;
}

/**
 * Generate Instagram username suggestions for a family
 * @param {Object} familyData - Family record from Supabase
 * @param {number} count - Number of suggestions to generate (default 4)
 * @returns {string[]} Array of username suggestions
 */
function generateUsernames(familyData, count = 4) {
  const suggestions = new Set();
  const names = extractNames(familyData);

  // If we have family member names, prioritize personalized usernames
  const hasNames = names.length > 0;

  const attempts = count * 10; // Prevent infinite loops
  let i = 0;

  while (suggestions.size < count && i < attempts) {
    i++;
    let username;

    if (hasNames && Math.random() > 0.3) {
      // 70% chance of personalized username if names available
      const name = pick(names);
      const patternKey = pick(['actionWithName', 'adjNounName', 'nounOfName']);
      username = PATTERNS[patternKey](name);
    } else {
      // Generic patterns
      const patternKey = pick(['actionForRelation', 'actionMyNoun', 'nounNounNumber', 'myNounMyNoun']);
      username = PATTERNS[patternKey]();
    }

    // Add number suffix sometimes (30% chance if not already has one)
    if (!/\d/.test(username) && Math.random() < 0.3) {
      username += randomSuffix();
    }

    // Validate length (Instagram max is 30, min is practical 6)
    if (username.length >= 6 && username.length <= 30) {
      suggestions.add(username);
    }
  }

  return Array.from(suggestions);
}

/**
 * Email generation for proxy cities (Quebec, Chicago/SF, Sarajevo only)
 */
const EMAIL_NAMES = {
  quebec: {
    male: ['Antoine', 'Claude', 'Sylvain', 'Marc', 'Pierre', 'Jean', 'Luc', 'Andre', 'Michel'],
    female: ['Sylvie', 'Marie', 'Sophie', 'Chantal', 'Nathalie', 'Julie', 'Isabelle'],
    surnames: ['Boucher', 'Perrault', 'Bouchard', 'Gagnon', 'Roy', 'Cote', 'Gauthier', 'Morin']
  },
  montreal: {
    male: ['Antoine', 'Claude', 'Sylvain', 'Marc', 'Pierre', 'Jean', 'Luc', 'Andre', 'Michel'],
    female: ['Sylvie', 'Marie', 'Sophie', 'Chantal', 'Nathalie', 'Julie', 'Isabelle'],
    surnames: ['Boucher', 'Perrault', 'Bouchard', 'Gagnon', 'Roy', 'Cote', 'Gauthier', 'Morin']
  },
  chicago: {
    male: ['Marcus', 'Johnny', 'David', 'Michael', 'James', 'Robert', 'William', 'Chris'],
    female: ['Amy', 'Amber', 'Jessica', 'Sarah', 'Jennifer', 'Emily', 'Ashley', 'Michelle'],
    surnames: ['Richardson', 'Powell', 'Martinez', 'Johnson', 'Williams', 'Brown', 'Davis', 'Garcia']
  },
  sanfrancisco: {
    male: ['Marcus', 'Johnny', 'David', 'Michael', 'James', 'Robert', 'William', 'Chris'],
    female: ['Amy', 'Amber', 'Jessica', 'Sarah', 'Jennifer', 'Emily', 'Ashley', 'Michelle'],
    surnames: ['Richardson', 'Powell', 'Martinez', 'Johnson', 'Williams', 'Brown', 'Davis', 'Garcia']
  },
  sarajevo: {
    male: ['Mirza', 'Emir', 'Aldin', 'Kemal', 'Tarik', 'Amer', 'Jasmin'],
    female: ['Lejla', 'Amina', 'Emina', 'Selma', 'Samira', 'Merima'],
    surnames: ['Kovac', 'Begic', 'Hadzic', 'Omerovic', 'Muratovic', 'Halilovic']
  }
};

/**
 * Generate email address matching proxy city
 * @param {string} proxyCity - The proxy city key (quebec, chicago, sanfrancisco, sarajevo)
 * @param {string} gender - 'male' or 'female' (optional, random if not provided)
 * @returns {Object} { email, firstName, surname }
 */
function generateEmail(proxyCity, gender = null) {
  // Normalize city name
  const cityKey = proxyCity?.toLowerCase().replace(/\s+/g, '') || 'quebec';

  // Get name pool for city (default to quebec if not found)
  const namePool = EMAIL_NAMES[cityKey] || EMAIL_NAMES.quebec;

  // Pick gender randomly if not specified
  const g = gender || (Math.random() > 0.5 ? 'male' : 'female');

  const firstName = pick(namePool[g]);
  const surname = pick(namePool.surnames);
  const birthYear = Math.floor(Math.random() * 8) + 88; // 88-95

  // Email format: firstname.surname.YY@protonmail.com
  const email = `${firstName.toLowerCase()}.${surname.toLowerCase()}.${birthYear}@protonmail.com`;

  return {
    email,
    firstName,
    surname,
    birthYear: 1900 + birthYear
  };
}

module.exports = {
  generateUsernames,
  generateEmail,
  extractNames,
  cleanName,
  WORDS,
  EMAIL_NAMES
};
