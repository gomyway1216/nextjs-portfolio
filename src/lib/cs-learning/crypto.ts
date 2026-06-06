export type CryptoTechniqueId =
  | 'caesar-cipher'
  | 'vigenere-cipher'
  | 'substitution-cipher'
  | 'rail-fence-cipher'
  | 'xor-cipher'
  | 'rsa'
  | 'diffie-hellman'
  | 'hash-functions';

export type CryptoTechnique = {
  id: CryptoTechniqueId;
  name: string;
  shortName: string;
  family: 'Classical' | 'Symmetric' | 'Public key' | 'Key exchange' | 'Hashing';
  route: string;
  summary: string;
  concept: string;
  securityNote: string;
  quiz: {
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
  };
};

export type CryptoInputs = {
  text: string;
  shift: number;
  key: string;
  substitutionKeyword: string;
  rails: number;
  xorKey: string;
  rsaP: number;
  rsaQ: number;
  rsaE: number;
  rsaMessage: number;
  dhPrime: number;
  dhGenerator: number;
  alicePrivate: number;
  bobPrivate: number;
};

export type CryptoStep = {
  label: string;
  expression: string;
  result: string;
  note: string;
};

export type CryptoDemo = {
  outputLabel: string;
  output: string;
  secondaryLabel?: string;
  secondaryOutput?: string;
  steps: CryptoStep[];
  warning?: string;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const DEFAULT_CRYPTO_INPUTS: CryptoInputs = {
  text: 'LEARN CRYPTO',
  shift: 3,
  key: 'KEY',
  substitutionKeyword: 'LAB',
  rails: 3,
  xorKey: 'key',
  rsaP: 5,
  rsaQ: 11,
  rsaE: 3,
  rsaMessage: 7,
  dhPrime: 23,
  dhGenerator: 5,
  alicePrivate: 6,
  bobPrivate: 15,
};

export const cryptoTechniques: CryptoTechnique[] = [
  {
    id: 'caesar-cipher',
    name: 'Caesar Cipher',
    shortName: 'Caesar',
    family: 'Classical',
    route: '/study/cs/cryptography/caesar-cipher',
    summary: 'Shifts each alphabetic character by a fixed offset.',
    concept: 'A monoalphabetic substitution where the key is one number.',
    securityNote: 'Educational only. A Caesar cipher can be broken by trying 26 shifts.',
    quiz: {
      question: 'Why is a Caesar cipher easy to brute force?',
      options: [
        'There are only 26 possible shifts for English letters.',
        'It requires a private key pair.',
        'It uses a different alphabet for every character.',
        'It cannot preserve spaces.',
      ],
      answerIndex: 0,
      explanation: 'Because the key space is tiny, an attacker can simply try every shift.',
    },
  },
  {
    id: 'vigenere-cipher',
    name: 'Vigenere Cipher',
    shortName: 'Vigenere',
    family: 'Classical',
    route: '/study/cs/cryptography/vigenere-cipher',
    summary: 'Uses a repeated keyword to apply a different Caesar shift to each letter.',
    concept: 'A polyalphabetic substitution: each key letter controls one shift.',
    securityNote: 'Educational only. Repeated-key Vigenere can be attacked when the key length is discovered.',
    quiz: {
      question: 'What makes Vigenere stronger than Caesar in the classroom model?',
      options: [
        'Different positions can use different shifts from the keyword.',
        'It never repeats a key.',
        'It is based on factoring large primes.',
        'It hashes the message first.',
      ],
      answerIndex: 0,
      explanation: 'The repeated keyword creates multiple shifts, so letter frequency is less obvious than Caesar.',
    },
  },
  {
    id: 'substitution-cipher',
    name: 'Substitution Cipher',
    shortName: 'Substitution',
    family: 'Classical',
    route: '/study/cs/cryptography/substitution-cipher',
    summary: 'Maps each plaintext letter to another fixed letter.',
    concept: 'The key is a shuffled alphabet, often derived from a keyword in this demo.',
    securityNote: 'Educational only. Frequency analysis can reveal likely plaintext letters.',
    quiz: {
      question: 'What stays visible in a simple substitution cipher?',
      options: [
        'Letter frequency patterns remain in the ciphertext.',
        'Every encrypted message has the same hash.',
        'The private exponent is public.',
        'The message is split into sorted halves.',
      ],
      answerIndex: 0,
      explanation: 'A fixed letter mapping preserves frequency patterns, which makes frequency analysis useful.',
    },
  },
  {
    id: 'rail-fence-cipher',
    name: 'Rail Fence Cipher',
    shortName: 'Rail Fence',
    family: 'Classical',
    route: '/study/cs/cryptography/rail-fence-cipher',
    summary: 'Writes text in a zigzag across rails, then reads each rail left to right.',
    concept: 'A transposition cipher: characters move positions instead of being replaced.',
    securityNote: 'Educational only. The number of rails is a small key and patterns remain visible.',
    quiz: {
      question: 'What type of cipher is Rail Fence?',
      options: [
        'A transposition cipher.',
        'A public-key cipher.',
        'A hash function.',
        'A stream cipher with a one-time pad.',
      ],
      answerIndex: 0,
      explanation: 'Rail Fence rearranges character positions, so it is a transposition cipher.',
    },
  },
  {
    id: 'xor-cipher',
    name: 'XOR Cipher',
    shortName: 'XOR',
    family: 'Symmetric',
    route: '/study/cs/cryptography/xor-cipher',
    summary: 'Combines each byte with a repeated key byte using XOR.',
    concept: 'XOR is reversible: applying the same key stream again recovers the message.',
    securityNote: 'A repeated XOR key is not secure. A truly random one-time key used once is a different model.',
    quiz: {
      question: 'Why can XOR encryption be decrypted with the same operation?',
      options: [
        'Because (message XOR key) XOR key returns the original message.',
        'Because XOR sorts bytes into ascending order.',
        'Because the public exponent equals the private exponent.',
        'Because XOR removes every repeated character.',
      ],
      answerIndex: 0,
      explanation: 'XOR cancels itself when the same key stream is applied a second time.',
    },
  },
  {
    id: 'rsa',
    name: 'RSA Demo',
    shortName: 'RSA',
    family: 'Public key',
    route: '/study/cs/cryptography/rsa',
    summary: 'Builds tiny public/private keys from two primes, then encrypts a small number.',
    concept: 'RSA uses modular exponentiation and the difficulty of factoring large composite numbers.',
    securityNote: 'This demo uses tiny numbers for learning. Real RSA must use vetted libraries and large keys.',
    quiz: {
      question: 'Which value must stay secret in real RSA?',
      options: [
        'The private exponent d.',
        'The public modulus n.',
        'The public exponent e.',
        'The ciphertext.',
      ],
      answerIndex: 0,
      explanation: 'The public key can be shared, but the private exponent is needed to decrypt.',
    },
  },
  {
    id: 'diffie-hellman',
    name: 'Diffie-Hellman Demo',
    shortName: 'DH',
    family: 'Key exchange',
    route: '/study/cs/cryptography/diffie-hellman',
    summary: 'Shows how two parties derive the same shared secret over a public channel.',
    concept: 'Both sides combine public parameters with private exponents under modular arithmetic.',
    securityNote: 'This demo uses tiny parameters. Real key exchange needs authenticated, modern groups.',
    quiz: {
      question: 'What do Alice and Bob end up sharing in Diffie-Hellman?',
      options: [
        'The same secret value, computed from different private exponents.',
        'The same private exponent.',
        'The same plaintext password.',
        'The same sorted array.',
      ],
      answerIndex: 0,
      explanation: 'Alice and Bob keep different private exponents, but modular exponentiation leads to one shared secret.',
    },
  },
  {
    id: 'hash-functions',
    name: 'Hash Functions',
    shortName: 'Hash',
    family: 'Hashing',
    route: '/study/cs/cryptography/hash-functions',
    summary: 'Compresses a message into a fixed-size fingerprint.',
    concept: 'A hash is one-way for verification, not encryption that can be decrypted.',
    securityNote: 'The shown hash is a toy 32-bit flow for visualization, not a cryptographic hash.',
    quiz: {
      question: 'Why is hashing not the same as encryption?',
      options: [
        'A hash is designed to be one-way, with no decryption key.',
        'A hash always uses two prime numbers.',
        'A hash keeps the original message hidden in every byte.',
        'A hash requires a repeated keyword.',
      ],
      answerIndex: 0,
      explanation: 'Encryption is reversible with a key; hashing is designed as a one-way fingerprint.',
    },
  },
];

export const getCryptoTechnique = (id: string): CryptoTechnique | undefined =>
  cryptoTechniques.find((technique) => technique.id === id);

export const isCryptoTechniqueId = (id: string): id is CryptoTechniqueId =>
  cryptoTechniques.some((technique) => technique.id === id);

export function computeCryptoDemo(id: CryptoTechniqueId, inputs: CryptoInputs): CryptoDemo {
  switch (id) {
    case 'caesar-cipher':
      return caesarDemo(inputs.text, inputs.shift);
    case 'vigenere-cipher':
      return vigenereDemo(inputs.text, inputs.key);
    case 'substitution-cipher':
      return substitutionDemo(inputs.text, inputs.substitutionKeyword);
    case 'rail-fence-cipher':
      return railFenceDemo(inputs.text, inputs.rails);
    case 'xor-cipher':
      return xorDemo(inputs.text, inputs.xorKey);
    case 'rsa':
      return rsaDemo(inputs.rsaP, inputs.rsaQ, inputs.rsaE, inputs.rsaMessage);
    case 'diffie-hellman':
      return diffieHellmanDemo(
        inputs.dhPrime,
        inputs.dhGenerator,
        inputs.alicePrivate,
        inputs.bobPrivate
      );
    case 'hash-functions':
      return hashDemo(inputs.text);
    default:
      return {
        outputLabel: 'Output',
        output: '',
        steps: [],
      };
  }
}

function caesarDemo(text: string, shift: number): CryptoDemo {
  const normalizedShift = mod(shift, 26);
  const encrypted = caesarTransform(text, normalizedShift);
  const decrypted = caesarTransform(encrypted, -normalizedShift);

  return {
    outputLabel: 'Ciphertext',
    output: encrypted,
    secondaryLabel: 'Decrypted',
    secondaryOutput: decrypted,
    steps: [
      {
        label: 'Normalize key',
        expression: `${shift} mod 26`,
        result: String(normalizedShift),
        note: 'The alphabet has 26 letters, so shifts wrap around.',
      },
      {
        label: 'Encrypt',
        expression: 'letter index + shift',
        result: encrypted,
        note: 'Each letter moves forward by the same offset.',
      },
      {
        label: 'Decrypt',
        expression: 'cipher index - shift',
        result: decrypted,
        note: 'The inverse shift recovers the original text.',
      },
    ],
  };
}

function vigenereDemo(text: string, key: string): CryptoDemo {
  const cleanKey = normalizeKey(key) || 'KEY';
  const encrypted = vigenereTransform(text, cleanKey, 'encrypt');
  const decrypted = vigenereTransform(encrypted, cleanKey, 'decrypt');

  return {
    outputLabel: 'Ciphertext',
    output: encrypted,
    secondaryLabel: 'Decrypted',
    secondaryOutput: decrypted,
    steps: [
      {
        label: 'Keyword',
        expression: cleanKey,
        result: cleanKey.split('').map((letter) => ALPHABET.indexOf(letter)).join(', '),
        note: 'Each key letter becomes a Caesar shift.',
      },
      {
        label: 'Encrypt',
        expression: 'plaintext letter + repeating key shift',
        result: encrypted,
        note: 'The keyword repeats across alphabetic characters.',
      },
      {
        label: 'Decrypt',
        expression: 'cipher letter - repeating key shift',
        result: decrypted,
        note: 'Subtracting the same repeated shifts restores the message.',
      },
    ],
  };
}

function substitutionDemo(text: string, keyword: string): CryptoDemo {
  const cipherAlphabet = keywordAlphabet(keyword);
  const encrypted = substitute(text, ALPHABET, cipherAlphabet);
  const decrypted = substitute(encrypted, cipherAlphabet, ALPHABET);

  return {
    outputLabel: 'Ciphertext',
    output: encrypted,
    secondaryLabel: 'Decrypted',
    secondaryOutput: decrypted,
    steps: [
      {
        label: 'Build alphabet',
        expression: `keyword = ${normalizeKey(keyword) || 'LAB'}`,
        result: cipherAlphabet,
        note: 'The keyword starts the alphabet, then unused letters fill the rest.',
      },
      {
        label: 'Encrypt',
        expression: 'A-Z -> keyword alphabet',
        result: encrypted,
        note: 'Each plaintext letter maps to one fixed ciphertext letter.',
      },
      {
        label: 'Decrypt',
        expression: 'keyword alphabet -> A-Z',
        result: decrypted,
        note: 'The inverse mapping recovers the plaintext.',
      },
    ],
  };
}

function railFenceDemo(text: string, rails: number): CryptoDemo {
  const normalizedRails = Math.max(2, Math.min(6, Math.round(rails)));
  const { encrypted, rows } = railFenceEncrypt(text, normalizedRails);

  return {
    outputLabel: 'Ciphertext',
    output: encrypted,
    steps: [
      {
        label: 'Rails',
        expression: String(normalizedRails),
        result: rows.map((row) => row.map((char) => char ?? '.').join('')).join(' / '),
        note: 'Characters move down and up through the rails in a zigzag.',
      },
      {
        label: 'Read rows',
        expression: 'top rail to bottom rail',
        result: encrypted,
        note: 'The ciphertext is made by reading each rail from left to right.',
      },
    ],
  };
}

function xorDemo(text: string, key: string): CryptoDemo {
  const cleanKey = key.length > 0 ? key : 'key';
  const encryptedBytes = Array.from(text).map((char, index) => (
    char.charCodeAt(0) ^ cleanKey.charCodeAt(index % cleanKey.length)
  ));
  const encryptedHex = encryptedBytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
  const decrypted = encryptedBytes
    .map((byte, index) => String.fromCharCode(byte ^ cleanKey.charCodeAt(index % cleanKey.length)))
    .join('');

  return {
    outputLabel: 'Cipher bytes',
    output: encryptedHex,
    secondaryLabel: 'Decrypted',
    secondaryOutput: decrypted,
    steps: [
      {
        label: 'Repeat key',
        expression: cleanKey,
        result: repeatedKey(cleanKey, text.length),
        note: 'The key stream repeats until it matches the message length.',
      },
      {
        label: 'Encrypt',
        expression: 'message byte XOR key byte',
        result: encryptedHex,
        note: 'XOR produces byte values, shown here in hex.',
      },
      {
        label: 'Decrypt',
        expression: 'cipher byte XOR key byte',
        result: decrypted,
        note: 'Applying the same key stream again cancels the XOR.',
      },
    ],
  };
}

function rsaDemo(p: number, q: number, e: number, message: number): CryptoDemo {
  const n = p * q;
  const phi = (p - 1) * (q - 1);
  const d = modInverse(e, phi);
  const encrypted = d ? modPow(message, e, n) : 0;
  const decrypted = d ? modPow(encrypted, d, n) : 0;
  const warnings: string[] = [];

  if (!isPrime(p) || !isPrime(q)) warnings.push('p and q should be prime numbers.');
  if (message >= n) warnings.push('The message number should be smaller than n.');
  if (!d) warnings.push('e must be coprime with phi(n), so d could not be found.');

  return {
    outputLabel: 'Ciphertext',
    output: d ? String(encrypted) : 'Invalid parameters',
    secondaryLabel: 'Decrypted',
    secondaryOutput: d ? String(decrypted) : undefined,
    warning: warnings.join(' '),
    steps: [
      {
        label: 'Modulus',
        expression: `n = ${p} x ${q}`,
        result: String(n),
        note: 'The modulus is public and defines the arithmetic space.',
      },
      {
        label: 'Totient',
        expression: `phi(n) = (${p} - 1) x (${q} - 1)`,
        result: String(phi),
        note: 'For two primes, phi(n) counts values coprime to n.',
      },
      {
        label: 'Private exponent',
        expression: `${e} x d = 1 mod ${phi}`,
        result: d ? String(d) : 'not found',
        note: 'd is the modular inverse of e under phi(n).',
      },
      {
        label: 'Encrypt',
        expression: `${message}^${e} mod ${n}`,
        result: d ? String(encrypted) : 'invalid',
        note: 'The public key is (e, n).',
      },
      {
        label: 'Decrypt',
        expression: d ? `${encrypted}^${d} mod ${n}` : 'invalid',
        result: d ? String(decrypted) : 'invalid',
        note: 'The private key is (d, n).',
      },
    ],
  };
}

function diffieHellmanDemo(prime: number, generator: number, alicePrivate: number, bobPrivate: number): CryptoDemo {
  const alicePublic = modPow(generator, alicePrivate, prime);
  const bobPublic = modPow(generator, bobPrivate, prime);
  const aliceShared = modPow(bobPublic, alicePrivate, prime);
  const bobShared = modPow(alicePublic, bobPrivate, prime);

  return {
    outputLabel: 'Shared secret',
    output: String(aliceShared),
    secondaryLabel: 'Bob computes',
    secondaryOutput: String(bobShared),
    warning: !isPrime(prime) ? 'The modulus p should be prime for this classroom model.' : undefined,
    steps: [
      {
        label: 'Public parameters',
        expression: `p = ${prime}, g = ${generator}`,
        result: 'shared openly',
        note: 'Everyone can know the prime modulus and generator.',
      },
      {
        label: 'Alice public value',
        expression: `${generator}^${alicePrivate} mod ${prime}`,
        result: String(alicePublic),
        note: 'Alice keeps her exponent private and sends this public value.',
      },
      {
        label: 'Bob public value',
        expression: `${generator}^${bobPrivate} mod ${prime}`,
        result: String(bobPublic),
        note: 'Bob keeps his exponent private and sends this public value.',
      },
      {
        label: 'Shared secret',
        expression: `${bobPublic}^${alicePrivate} mod ${prime} = ${alicePublic}^${bobPrivate} mod ${prime}`,
        result: `${aliceShared} = ${bobShared}`,
        note: 'Both sides arrive at the same value without sending it directly.',
      },
    ],
  };
}

function hashDemo(text: string): CryptoDemo {
  const seed = 2166136261;
  let hash = seed;
  const steps: CryptoStep[] = [
    {
      label: 'Initialize',
      expression: 'offset basis',
      result: toHex(seed),
      note: 'This toy flow starts with a fixed initial value.',
    },
  ];

  Array.from(text).forEach((char, index) => {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;

    if (index < 4) {
      steps.push({
        label: `Mix ${index + 1}`,
        expression: `hash XOR ${char.charCodeAt(0)}, then multiply`,
        result: toHex(hash),
        note: `Character "${char}" changes the running fingerprint.`,
      });
    }
  });

  if (text.length > 4) {
    steps.push({
      label: 'Continue mixing',
      expression: `${text.length - 4} more character${text.length - 4 === 1 ? '' : 's'}`,
      result: toHex(hash),
      note: 'Every character affects the final fixed-size output.',
    });
  }

  return {
    outputLabel: 'Toy hash',
    output: toHex(hash),
    steps,
    warning: 'This is a small visualization hash, not SHA-256 or a secure password hash.',
  };
}

function caesarTransform(text: string, shift: number) {
  return text.replace(/[a-z]/gi, (char) => {
    const isLower = char >= 'a' && char <= 'z';
    const base = isLower ? 97 : 65;
    const next = mod(char.charCodeAt(0) - base + shift, 26) + base;
    return String.fromCharCode(next);
  });
}

function vigenereTransform(text: string, key: string, mode: 'encrypt' | 'decrypt') {
  let keyIndex = 0;

  return text.replace(/[a-z]/gi, (char) => {
    const isLower = char >= 'a' && char <= 'z';
    const base = isLower ? 97 : 65;
    const shift = ALPHABET.indexOf(key[keyIndex % key.length]);
    keyIndex += 1;
    const signedShift = mode === 'encrypt' ? shift : -shift;
    const next = mod(char.charCodeAt(0) - base + signedShift, 26) + base;
    return String.fromCharCode(next);
  });
}

function keywordAlphabet(keyword: string) {
  const cleanKeyword = normalizeKey(keyword) || 'LAB';
  const seen = new Set<string>();

  return `${cleanKeyword}${ALPHABET}`
    .split('')
    .filter((letter) => {
      if (seen.has(letter)) return false;
      seen.add(letter);
      return true;
    })
    .join('');
}

function substitute(text: string, from: string, to: string) {
  return text.replace(/[a-z]/gi, (char) => {
    const isLower = char >= 'a' && char <= 'z';
    const index = from.indexOf(char.toUpperCase());
    const next = to[index] ?? char;
    return isLower ? next.toLowerCase() : next;
  });
}

function railFenceEncrypt(text: string, rails: number) {
  const rows: Array<Array<string | null>> = Array.from({ length: rails }, () =>
    Array<string | null>(text.length).fill(null)
  );
  let row = 0;
  let direction = 1;

  Array.from(text).forEach((char, index) => {
    rows[row][index] = char;

    if (row === 0) direction = 1;
    if (row === rails - 1) direction = -1;
    row += direction;
  });

  return {
    rows,
    encrypted: rows
      .map((rail) => rail.filter((char): char is string => char !== null).join(''))
      .join(''),
  };
}

function normalizeKey(key: string) {
  return key.toUpperCase().replace(/[^A-Z]/g, '');
}

function repeatedKey(key: string, length: number) {
  return Array.from({ length }, (_, index) => key[index % key.length]).join('');
}

function mod(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);

  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }

  return x;
}

function modInverse(value: number, modulus: number) {
  if (gcd(value, modulus) !== 1) return null;

  for (let candidate = 1; candidate < modulus; candidate += 1) {
    if ((value * candidate) % modulus === 1) return candidate;
  }

  return null;
}

function modPow(base: number, exponent: number, modulus: number) {
  let result = 1;
  let currentBase = mod(base, modulus);
  let currentExponent = exponent;

  while (currentExponent > 0) {
    if (currentExponent % 2 === 1) {
      result = (result * currentBase) % modulus;
    }
    currentBase = (currentBase * currentBase) % modulus;
    currentExponent = Math.floor(currentExponent / 2);
  }

  return result;
}

function isPrime(value: number) {
  if (value < 2) return false;
  for (let i = 2; i * i <= value; i += 1) {
    if (value % i === 0) return false;
  }
  return true;
}

function toHex(value: number) {
  return `0x${(value >>> 0).toString(16).padStart(8, '0')}`;
}
