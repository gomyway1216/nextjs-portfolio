import type { CsLearningLanguage } from './localization';

export type CryptoTechniqueId =
  | 'caesar-cipher'
  | 'vigenere-cipher'
  | 'substitution-cipher'
  | 'rail-fence-cipher'
  | 'xor-cipher'
  | 'rsa'
  | 'diffie-hellman'
  | 'hash-functions';

export type CryptoTechniqueFamily =
  | 'classical'
  | 'symmetric'
  | 'public-key'
  | 'key-exchange'
  | 'hashing';

export type CryptoTechnique = {
  id: CryptoTechniqueId;
  name: string;
  shortName: string;
  family: CryptoTechniqueFamily;
  familyLabel: string;
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
    family: 'classical',
    familyLabel: 'Classical',
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
    family: 'classical',
    familyLabel: 'Classical',
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
    family: 'classical',
    familyLabel: 'Classical',
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
    family: 'classical',
    familyLabel: 'Classical',
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
    family: 'symmetric',
    familyLabel: 'Symmetric',
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
    family: 'public-key',
    familyLabel: 'Public key',
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
    family: 'key-exchange',
    familyLabel: 'Key exchange',
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
    family: 'hashing',
    familyLabel: 'Hashing',
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

const cryptoTechniqueTranslations: Record<CsLearningLanguage, Partial<Record<CryptoTechniqueId, Partial<CryptoTechnique>>>> = {
  en: {},
  ja: {
    'caesar-cipher': {
      name: 'シーザー暗号',
      shortName: 'シーザー',
      familyLabel: '古典暗号',
      summary: '各アルファベットを固定の数だけずらします。',
      concept: '鍵が1つの数である、単一換字暗号です。',
      securityNote: '学習用です。シーザー暗号は26通りのシフトを試すだけで破れます。',
      quiz: {
        question: 'シーザー暗号が総当たりしやすい理由は？',
        options: [
          '英字では可能なシフトが26通りしかないから。',
          '秘密鍵ペアが必要だから。',
          '文字ごとに違うアルファベットを使うから。',
          '空白を保持できないから。',
        ],
        answerIndex: 0,
        explanation: '鍵空間が非常に小さいため、攻撃者は全シフトを試せます。',
      },
    },
    'vigenere-cipher': {
      name: 'ヴィジュネル暗号',
      shortName: 'ヴィジュネル',
      familyLabel: '古典暗号',
      summary: '繰り返すキーワードで、文字ごとに異なるシーザーシフトを適用します。',
      concept: '多表式換字暗号です。各キー文字が1つのシフト量を決めます。',
      securityNote: '学習用です。繰り返し鍵のヴィジュネル暗号は、鍵長が分かると攻撃できます。',
      quiz: {
        question: '授業用モデルでヴィジュネル暗号がシーザー暗号より強い理由は？',
        options: [
          '位置ごとにキーワード由来の異なるシフトを使えるから。',
          '鍵が絶対に繰り返されないから。',
          '大きな素数の因数分解に基づくから。',
          '先にメッセージをハッシュするから。',
        ],
        answerIndex: 0,
        explanation: '繰り返すキーワードが複数のシフトを作るため、シーザー暗号より文字頻度が見えにくくなります。',
      },
    },
    'substitution-cipher': {
      name: '単純換字暗号',
      shortName: '換字',
      familyLabel: '古典暗号',
      summary: '平文の各文字を、固定された別の文字へ対応させます。',
      concept: '鍵は並び替えたアルファベットです。このデモではキーワードから作ります。',
      securityNote: '学習用です。頻度分析で平文の候補文字を推測できます。',
      quiz: {
        question: '単純換字暗号で残りやすい情報は？',
        options: [
          '暗号文にも文字頻度のパターンが残る。',
          'すべての暗号文が同じハッシュになる。',
          '秘密指数が公開される。',
          'メッセージが整列済みの半分に分割される。',
        ],
        answerIndex: 0,
        explanation: '固定対応では文字頻度のパターンが残るため、頻度分析が有効です。',
      },
    },
    'rail-fence-cipher': {
      name: 'レールフェンス暗号',
      shortName: 'レール',
      familyLabel: '古典暗号',
      summary: '文字をレール上にジグザグに書き、各レールを左から右へ読みます。',
      concept: '転置暗号です。文字を置き換えず、位置を移動します。',
      securityNote: '学習用です。レール数は小さな鍵で、パターンも残ります。',
      quiz: {
        question: 'レールフェンス暗号はどの種類の暗号ですか？',
        options: [
          '転置暗号。',
          '公開鍵暗号。',
          'ハッシュ関数。',
          'ワンタイムパッドのストリーム暗号。',
        ],
        answerIndex: 0,
        explanation: 'レールフェンス暗号は文字の位置を並べ替えるため、転置暗号です。',
      },
    },
    'xor-cipher': {
      name: 'XOR暗号',
      shortName: 'XOR',
      familyLabel: '共通鍵',
      summary: '各バイトを、繰り返した鍵バイトとXORで組み合わせます。',
      concept: 'XORは可逆です。同じキーストリームをもう一度適用すると元に戻ります。',
      securityNote: '繰り返しXOR鍵は安全ではありません。一度だけ使う真にランダムな鍵は別のモデルです。',
      quiz: {
        question: 'XOR暗号を同じ操作で復号できる理由は？',
        options: [
          '(message XOR key) XOR key が元のmessageに戻るから。',
          'XORがバイトを昇順に並べるから。',
          '公開指数と秘密指数が同じだから。',
          'XORが重複文字をすべて消すから。',
        ],
        answerIndex: 0,
        explanation: '同じキーストリームを2回適用すると、XORが打ち消し合います。',
      },
    },
    rsa: {
      name: 'RSAデモ',
      shortName: 'RSA',
      familyLabel: '公開鍵',
      summary: '2つの素数から小さな公開鍵/秘密鍵を作り、小さな数を暗号化します。',
      concept: 'RSAは剰余べき乗と、大きな合成数の因数分解が難しいことを使います。',
      securityNote: 'このデモは学習用に小さな数を使います。実際のRSAは検証済みライブラリと大きな鍵が必要です。',
      quiz: {
        question: '実際のRSAで秘密にすべき値は？',
        options: [
          '秘密指数 d。',
          '公開法 n。',
          '公開指数 e。',
          '暗号文。',
        ],
        answerIndex: 0,
        explanation: '公開鍵は共有できますが、復号には秘密指数が必要です。',
      },
    },
    'diffie-hellman': {
      name: 'Diffie-Hellmanデモ',
      shortName: 'DH',
      familyLabel: '鍵交換',
      summary: '公開チャネル上で、2者が同じ共有秘密を導けることを示します。',
      concept: '両者は公開パラメータと秘密指数を、剰余計算の中で組み合わせます。',
      securityNote: 'このデモは小さなパラメータを使います。実際の鍵交換には認証済みで現代的な群が必要です。',
      quiz: {
        question: 'Diffie-HellmanでAliceとBobが最終的に共有するものは？',
        options: [
          '異なる秘密指数から計算された同じ秘密値。',
          '同じ秘密指数。',
          '同じ平文パスワード。',
          '同じ整列済み配列。',
        ],
        answerIndex: 0,
        explanation: 'AliceとBobは別々の秘密指数を持ちますが、剰余べき乗によって同じ共有秘密に到達します。',
      },
    },
    'hash-functions': {
      name: 'ハッシュ関数',
      shortName: 'ハッシュ',
      familyLabel: 'ハッシュ',
      summary: 'メッセージを固定長の指紋へ圧縮します。',
      concept: 'ハッシュは検証用の一方向関数であり、復号できる暗号化ではありません。',
      securityNote: '表示しているハッシュは可視化用のおもちゃの32-bit処理で、暗号学的ハッシュではありません。',
      quiz: {
        question: 'ハッシュが暗号化と同じではない理由は？',
        options: [
          'ハッシュは復号鍵を持たない一方向の仕組みだから。',
          'ハッシュは常に2つの素数を使うから。',
          'ハッシュは元メッセージを各バイトに隠すから。',
          'ハッシュには繰り返しキーワードが必要だから。',
        ],
        answerIndex: 0,
        explanation: '暗号化は鍵で元に戻せますが、ハッシュは一方向の指紋として設計されています。',
      },
    },
  },
};

export function getLocalizedCryptoTechnique(id: string, language: CsLearningLanguage): CryptoTechnique | undefined {
  const technique = getCryptoTechnique(id);
  if (!technique) return undefined;
  return {
    ...technique,
    ...cryptoTechniqueTranslations[language][technique.id],
  };
}

export function getLocalizedCryptoTechniques(language: CsLearningLanguage): CryptoTechnique[] {
  return cryptoTechniques.map((technique) => getLocalizedCryptoTechnique(technique.id, language) ?? technique);
}

export function computeCryptoDemo(
  id: CryptoTechniqueId,
  inputs: CryptoInputs,
  language: CsLearningLanguage = 'en'
): CryptoDemo {
  switch (id) {
    case 'caesar-cipher':
      return caesarDemo(inputs.text, inputs.shift, language);
    case 'vigenere-cipher':
      return vigenereDemo(inputs.text, inputs.key, language);
    case 'substitution-cipher':
      return substitutionDemo(inputs.text, inputs.substitutionKeyword, language);
    case 'rail-fence-cipher':
      return railFenceDemo(inputs.text, inputs.rails, language);
    case 'xor-cipher':
      return xorDemo(inputs.text, inputs.xorKey, language);
    case 'rsa':
      return rsaDemo(inputs.rsaP, inputs.rsaQ, inputs.rsaE, inputs.rsaMessage, language);
    case 'diffie-hellman':
      return diffieHellmanDemo(
        inputs.dhPrime,
        inputs.dhGenerator,
        inputs.alicePrivate,
        inputs.bobPrivate,
        language
      );
    case 'hash-functions':
      return hashDemo(inputs.text, language);
    default:
      return {
        outputLabel: cryptoDemoCopy[language].output,
        output: '',
        steps: [],
      };
  }
}

type CryptoDemoCopy = {
  output: string;
  ciphertext: string;
  decrypted: string;
  cipherBytes: string;
  sharedSecret: string;
  bobComputes: string;
  toyHash: string;
  invalidParameters: string;
  invalid: string;
  notFound: string;
  sharedOpenly: string;
  caesar: {
    normalizeKey: string;
    normalizeExpression: (shift: number) => string;
    alphabetWrap: string;
    encrypt: string;
    encryptExpression: string;
    encryptNote: string;
    decrypt: string;
    decryptExpression: string;
    decryptNote: string;
  };
  vigenere: {
    keyword: string;
    keywordNote: string;
    encrypt: string;
    encryptExpression: string;
    encryptNote: string;
    decrypt: string;
    decryptExpression: string;
    decryptNote: string;
  };
  substitution: {
    buildAlphabet: string;
    keywordExpression: (keyword: string) => string;
    alphabetNote: string;
    encrypt: string;
    encryptExpression: string;
    encryptNote: string;
    decrypt: string;
    decryptExpression: string;
    decryptNote: string;
  };
  railFence: {
    rails: string;
    zigzagNote: string;
    readRows: string;
    readRowsExpression: string;
    readRowsNote: string;
  };
  xor: {
    repeatKey: string;
    repeatKeyNote: string;
    encrypt: string;
    encryptExpression: string;
    encryptNote: string;
    decrypt: string;
    decryptExpression: string;
    decryptNote: string;
  };
  rsa: {
    primeWarning: string;
    messageWarning: string;
    exponentWarning: string;
    modulus: string;
    modulusExpression: (p: number, q: number) => string;
    modulusNote: string;
    totient: string;
    totientExpression: (p: number, q: number) => string;
    totientNote: string;
    privateExponent: string;
    privateExponentExpression: (e: number, phi: number) => string;
    privateExponentNote: string;
    encrypt: string;
    encryptExpression: (message: number, e: number, n: number) => string;
    encryptNote: string;
    decrypt: string;
    decryptExpression: (encrypted: number, d: number, n: number) => string;
    decryptNote: string;
  };
  diffieHellman: {
    primeWarning: string;
    publicParameters: string;
    publicParametersExpression: (prime: number, generator: number) => string;
    publicParametersNote: string;
    alicePublic: string;
    alicePublicExpression: (generator: number, alicePrivate: number, prime: number) => string;
    alicePublicNote: string;
    bobPublic: string;
    bobPublicExpression: (generator: number, bobPrivate: number, prime: number) => string;
    bobPublicNote: string;
    sharedSecret: string;
    sharedSecretExpression: (
      bobPublic: number,
      alicePrivate: number,
      prime: number,
      alicePublic: number,
      bobPrivate: number
    ) => string;
    sharedSecretNote: string;
  };
  hash: {
    initialize: string;
    initializeExpression: string;
    initializeNote: string;
    mix: (index: number) => string;
    mixExpression: (charCode: number) => string;
    mixNote: (char: string) => string;
    continueMixing: string;
    continueExpression: (count: number) => string;
    continueNote: string;
    warning: string;
  };
};

const cryptoDemoCopy: Record<CsLearningLanguage, CryptoDemoCopy> = {
  en: {
    output: 'Output',
    ciphertext: 'Ciphertext',
    decrypted: 'Decrypted',
    cipherBytes: 'Cipher bytes',
    sharedSecret: 'Shared secret',
    bobComputes: 'Bob computes',
    toyHash: 'Toy hash',
    invalidParameters: 'Invalid parameters',
    invalid: 'invalid',
    notFound: 'not found',
    sharedOpenly: 'shared openly',
    caesar: {
      normalizeKey: 'Normalize key',
      normalizeExpression: (shift) => `${shift} mod 26`,
      alphabetWrap: 'The alphabet has 26 letters, so shifts wrap around.',
      encrypt: 'Encrypt',
      encryptExpression: 'letter index + shift',
      encryptNote: 'Each letter moves forward by the same offset.',
      decrypt: 'Decrypt',
      decryptExpression: 'cipher index - shift',
      decryptNote: 'The inverse shift recovers the original text.',
    },
    vigenere: {
      keyword: 'Keyword',
      keywordNote: 'Each key letter becomes a Caesar shift.',
      encrypt: 'Encrypt',
      encryptExpression: 'plaintext letter + repeating key shift',
      encryptNote: 'The keyword repeats across alphabetic characters.',
      decrypt: 'Decrypt',
      decryptExpression: 'cipher letter - repeating key shift',
      decryptNote: 'Subtracting the same repeated shifts restores the message.',
    },
    substitution: {
      buildAlphabet: 'Build alphabet',
      keywordExpression: (keyword) => `keyword = ${keyword}`,
      alphabetNote: 'The keyword starts the alphabet, then unused letters fill the rest.',
      encrypt: 'Encrypt',
      encryptExpression: 'A-Z -> keyword alphabet',
      encryptNote: 'Each plaintext letter maps to one fixed ciphertext letter.',
      decrypt: 'Decrypt',
      decryptExpression: 'keyword alphabet -> A-Z',
      decryptNote: 'The inverse mapping recovers the plaintext.',
    },
    railFence: {
      rails: 'Rails',
      zigzagNote: 'Characters move down and up through the rails in a zigzag.',
      readRows: 'Read rows',
      readRowsExpression: 'top rail to bottom rail',
      readRowsNote: 'The ciphertext is made by reading each rail from left to right.',
    },
    xor: {
      repeatKey: 'Repeat key',
      repeatKeyNote: 'The key stream repeats until it matches the message length.',
      encrypt: 'Encrypt',
      encryptExpression: 'message byte XOR key byte',
      encryptNote: 'XOR produces byte values, shown here in hex.',
      decrypt: 'Decrypt',
      decryptExpression: 'cipher byte XOR key byte',
      decryptNote: 'Applying the same key stream again cancels the XOR.',
    },
    rsa: {
      primeWarning: 'p and q should be prime numbers.',
      messageWarning: 'The message number should be smaller than n.',
      exponentWarning: 'e must be coprime with phi(n), so d could not be found.',
      modulus: 'Modulus',
      modulusExpression: (p, q) => `n = ${p} x ${q}`,
      modulusNote: 'The modulus is public and defines the arithmetic space.',
      totient: 'Totient',
      totientExpression: (p, q) => `phi(n) = (${p} - 1) x (${q} - 1)`,
      totientNote: 'For two primes, phi(n) counts values coprime to n.',
      privateExponent: 'Private exponent',
      privateExponentExpression: (e, phi) => `${e} x d = 1 mod ${phi}`,
      privateExponentNote: 'd is the modular inverse of e under phi(n).',
      encrypt: 'Encrypt',
      encryptExpression: (message, e, n) => `${message}^${e} mod ${n}`,
      encryptNote: 'The public key is (e, n).',
      decrypt: 'Decrypt',
      decryptExpression: (encrypted, d, n) => `${encrypted}^${d} mod ${n}`,
      decryptNote: 'The private key is (d, n).',
    },
    diffieHellman: {
      primeWarning: 'The modulus p should be prime for this classroom model.',
      publicParameters: 'Public parameters',
      publicParametersExpression: (prime, generator) => `p = ${prime}, g = ${generator}`,
      publicParametersNote: 'Everyone can know the prime modulus and generator.',
      alicePublic: 'Alice public value',
      alicePublicExpression: (generator, alicePrivate, prime) => `${generator}^${alicePrivate} mod ${prime}`,
      alicePublicNote: 'Alice keeps her exponent private and sends this public value.',
      bobPublic: 'Bob public value',
      bobPublicExpression: (generator, bobPrivate, prime) => `${generator}^${bobPrivate} mod ${prime}`,
      bobPublicNote: 'Bob keeps his exponent private and sends this public value.',
      sharedSecret: 'Shared secret',
      sharedSecretExpression: (bobPublic, alicePrivate, prime, alicePublic, bobPrivate) =>
        `${bobPublic}^${alicePrivate} mod ${prime} = ${alicePublic}^${bobPrivate} mod ${prime}`,
      sharedSecretNote: 'Both sides arrive at the same value without sending it directly.',
    },
    hash: {
      initialize: 'Initialize',
      initializeExpression: 'offset basis',
      initializeNote: 'This toy flow starts with a fixed initial value.',
      mix: (index) => `Mix ${index}`,
      mixExpression: (charCode) => `hash XOR ${charCode}, then multiply`,
      mixNote: (char) => `Character "${char}" changes the running fingerprint.`,
      continueMixing: 'Continue mixing',
      continueExpression: (count) => `${count} more character${count === 1 ? '' : 's'}`,
      continueNote: 'Every character affects the final fixed-size output.',
      warning: 'This is a small visualization hash, not SHA-256 or a secure password hash.',
    },
  },
  ja: {
    output: '出力',
    ciphertext: '暗号文',
    decrypted: '復号',
    cipherBytes: '暗号バイト列',
    sharedSecret: '共有秘密',
    bobComputes: 'Bobの計算',
    toyHash: 'おもちゃハッシュ',
    invalidParameters: '無効なパラメータ',
    invalid: '無効',
    notFound: '見つかりません',
    sharedOpenly: '公開して共有',
    caesar: {
      normalizeKey: '鍵を正規化',
      normalizeExpression: (shift) => `${shift} mod 26`,
      alphabetWrap: 'アルファベットは26文字なので、シフトは循環します。',
      encrypt: '暗号化',
      encryptExpression: '文字の位置 + シフト',
      encryptNote: '各文字を同じ量だけ前へ進めます。',
      decrypt: '復号',
      decryptExpression: '暗号文字の位置 - シフト',
      decryptNote: '逆方向にずらすと元のテキストへ戻ります。',
    },
    vigenere: {
      keyword: 'キーワード',
      keywordNote: '各キー文字がシーザーシフト量になります。',
      encrypt: '暗号化',
      encryptExpression: '平文の文字 + 繰り返すキーシフト',
      encryptNote: 'キーワードはアルファベット文字に沿って繰り返されます。',
      decrypt: '復号',
      decryptExpression: '暗号文字 - 繰り返すキーシフト',
      decryptNote: '同じ繰り返しシフトを引くとメッセージが戻ります。',
    },
    substitution: {
      buildAlphabet: 'アルファベットを作る',
      keywordExpression: (keyword) => `キーワード = ${keyword}`,
      alphabetNote: 'キーワードで始め、未使用の文字で残りを埋めます。',
      encrypt: '暗号化',
      encryptExpression: 'A-Z -> キーワードアルファベット',
      encryptNote: '各平文文字を固定された暗号文字へ対応させます。',
      decrypt: '復号',
      decryptExpression: 'キーワードアルファベット -> A-Z',
      decryptNote: '逆向きの対応で平文を復元します。',
    },
    railFence: {
      rails: 'レール',
      zigzagNote: '文字はレールを下がって上がるジグザグに配置されます。',
      readRows: '行を読む',
      readRowsExpression: '上のレールから下のレールへ',
      readRowsNote: '暗号文は各レールを左から右へ読んで作ります。',
    },
    xor: {
      repeatKey: 'キーを繰り返す',
      repeatKeyNote: 'キーストリームはメッセージ長に合うまで繰り返されます。',
      encrypt: '暗号化',
      encryptExpression: 'メッセージバイト XOR キーバイト',
      encryptNote: 'XORの結果はバイト値になり、ここでは16進数で表示します。',
      decrypt: '復号',
      decryptExpression: '暗号バイト XOR キーバイト',
      decryptNote: '同じキーストリームをもう一度適用するとXORが打ち消されます。',
    },
    rsa: {
      primeWarning: 'pとqは素数である必要があります。',
      messageWarning: 'メッセージ番号はnより小さくする必要があります。',
      exponentWarning: 'eはphi(n)と互いに素である必要があるため、dを見つけられませんでした。',
      modulus: '法',
      modulusExpression: (p, q) => `n = ${p} x ${q}`,
      modulusNote: '法は公開され、剰余計算の空間を定義します。',
      totient: 'トーシェント',
      totientExpression: (p, q) => `phi(n) = (${p} - 1) x (${q} - 1)`,
      totientNote: '2つの素数では、phi(n)はnと互いに素な値の数を表します。',
      privateExponent: '秘密指数',
      privateExponentExpression: (e, phi) => `${e} x d = 1 mod ${phi}`,
      privateExponentNote: 'dはphi(n)におけるeの剰余逆元です。',
      encrypt: '暗号化',
      encryptExpression: (message, e, n) => `${message}^${e} mod ${n}`,
      encryptNote: '公開鍵は(e, n)です。',
      decrypt: '復号',
      decryptExpression: (encrypted, d, n) => `${encrypted}^${d} mod ${n}`,
      decryptNote: '秘密鍵は(d, n)です。',
    },
    diffieHellman: {
      primeWarning: 'この授業用モデルでは、法pは素数である必要があります。',
      publicParameters: '公開パラメータ',
      publicParametersExpression: (prime, generator) => `p = ${prime}, g = ${generator}`,
      publicParametersNote: '素数の法と生成元は全員が知っていて構いません。',
      alicePublic: 'Aliceの公開値',
      alicePublicExpression: (generator, alicePrivate, prime) => `${generator}^${alicePrivate} mod ${prime}`,
      alicePublicNote: 'Aliceは指数を秘密にしたまま、この公開値を送ります。',
      bobPublic: 'Bobの公開値',
      bobPublicExpression: (generator, bobPrivate, prime) => `${generator}^${bobPrivate} mod ${prime}`,
      bobPublicNote: 'Bobも指数を秘密にしたまま、この公開値を送ります。',
      sharedSecret: '共有秘密',
      sharedSecretExpression: (bobPublic, alicePrivate, prime, alicePublic, bobPrivate) =>
        `${bobPublic}^${alicePrivate} mod ${prime} = ${alicePublic}^${bobPrivate} mod ${prime}`,
      sharedSecretNote: '両者は秘密値を直接送らずに、同じ値へ到達します。',
    },
    hash: {
      initialize: '初期化',
      initializeExpression: 'オフセット基準値',
      initializeNote: 'このおもちゃの処理は固定の初期値から始まります。',
      mix: (index) => `混合 ${index}`,
      mixExpression: (charCode) => `hash XOR ${charCode} の後に乗算`,
      mixNote: (char) => `文字「${char}」が途中の指紋を変化させます。`,
      continueMixing: '混合を続ける',
      continueExpression: (count) => `残り${count}文字`,
      continueNote: 'すべての文字が最終的な固定長出力に影響します。',
      warning: 'これは小さな可視化用ハッシュであり、SHA-256や安全なパスワードハッシュではありません。',
    },
  },
};

function caesarDemo(text: string, shift: number, language: CsLearningLanguage): CryptoDemo {
  const normalizedShift = mod(shift, 26);
  const encrypted = caesarTransform(text, normalizedShift);
  const decrypted = caesarTransform(encrypted, -normalizedShift);
  const copy = cryptoDemoCopy[language];
  const caesar = copy.caesar;

  return {
    outputLabel: copy.ciphertext,
    output: encrypted,
    secondaryLabel: copy.decrypted,
    secondaryOutput: decrypted,
    steps: [
      {
        label: caesar.normalizeKey,
        expression: caesar.normalizeExpression(shift),
        result: String(normalizedShift),
        note: caesar.alphabetWrap,
      },
      {
        label: caesar.encrypt,
        expression: caesar.encryptExpression,
        result: encrypted,
        note: caesar.encryptNote,
      },
      {
        label: caesar.decrypt,
        expression: caesar.decryptExpression,
        result: decrypted,
        note: caesar.decryptNote,
      },
    ],
  };
}

function vigenereDemo(text: string, key: string, language: CsLearningLanguage): CryptoDemo {
  const cleanKey = normalizeKey(key) || 'KEY';
  const encrypted = vigenereTransform(text, cleanKey, 'encrypt');
  const decrypted = vigenereTransform(encrypted, cleanKey, 'decrypt');
  const copy = cryptoDemoCopy[language];
  const vigenere = copy.vigenere;

  return {
    outputLabel: copy.ciphertext,
    output: encrypted,
    secondaryLabel: copy.decrypted,
    secondaryOutput: decrypted,
    steps: [
      {
        label: vigenere.keyword,
        expression: cleanKey,
        result: cleanKey.split('').map((letter) => ALPHABET.indexOf(letter)).join(', '),
        note: vigenere.keywordNote,
      },
      {
        label: vigenere.encrypt,
        expression: vigenere.encryptExpression,
        result: encrypted,
        note: vigenere.encryptNote,
      },
      {
        label: vigenere.decrypt,
        expression: vigenere.decryptExpression,
        result: decrypted,
        note: vigenere.decryptNote,
      },
    ],
  };
}

function substitutionDemo(text: string, keyword: string, language: CsLearningLanguage): CryptoDemo {
  const cipherAlphabet = keywordAlphabet(keyword);
  const encrypted = substitute(text, ALPHABET, cipherAlphabet);
  const decrypted = substitute(encrypted, cipherAlphabet, ALPHABET);
  const copy = cryptoDemoCopy[language];
  const substitution = copy.substitution;

  return {
    outputLabel: copy.ciphertext,
    output: encrypted,
    secondaryLabel: copy.decrypted,
    secondaryOutput: decrypted,
    steps: [
      {
        label: substitution.buildAlphabet,
        expression: substitution.keywordExpression(normalizeKey(keyword) || 'LAB'),
        result: cipherAlphabet,
        note: substitution.alphabetNote,
      },
      {
        label: substitution.encrypt,
        expression: substitution.encryptExpression,
        result: encrypted,
        note: substitution.encryptNote,
      },
      {
        label: substitution.decrypt,
        expression: substitution.decryptExpression,
        result: decrypted,
        note: substitution.decryptNote,
      },
    ],
  };
}

function railFenceDemo(text: string, rails: number, language: CsLearningLanguage): CryptoDemo {
  const normalizedRails = Math.max(2, Math.min(6, Math.round(rails)));
  const { encrypted, rows } = railFenceEncrypt(text, normalizedRails);
  const copy = cryptoDemoCopy[language];
  const railFence = copy.railFence;

  return {
    outputLabel: copy.ciphertext,
    output: encrypted,
    steps: [
      {
        label: railFence.rails,
        expression: String(normalizedRails),
        result: rows.map((row) => row.map((char) => char ?? '.').join('')).join(' / '),
        note: railFence.zigzagNote,
      },
      {
        label: railFence.readRows,
        expression: railFence.readRowsExpression,
        result: encrypted,
        note: railFence.readRowsNote,
      },
    ],
  };
}

function xorDemo(text: string, key: string, language: CsLearningLanguage): CryptoDemo {
  const cleanKey = key.length > 0 ? key : 'key';
  const encryptedBytes = Array.from(text).map((char, index) => (
    char.charCodeAt(0) ^ cleanKey.charCodeAt(index % cleanKey.length)
  ));
  const encryptedHex = encryptedBytes.map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
  const decrypted = encryptedBytes
    .map((byte, index) => String.fromCharCode(byte ^ cleanKey.charCodeAt(index % cleanKey.length)))
    .join('');
  const copy = cryptoDemoCopy[language];
  const xor = copy.xor;

  return {
    outputLabel: copy.cipherBytes,
    output: encryptedHex,
    secondaryLabel: copy.decrypted,
    secondaryOutput: decrypted,
    steps: [
      {
        label: xor.repeatKey,
        expression: cleanKey,
        result: repeatedKey(cleanKey, text.length),
        note: xor.repeatKeyNote,
      },
      {
        label: xor.encrypt,
        expression: xor.encryptExpression,
        result: encryptedHex,
        note: xor.encryptNote,
      },
      {
        label: xor.decrypt,
        expression: xor.decryptExpression,
        result: decrypted,
        note: xor.decryptNote,
      },
    ],
  };
}

function rsaDemo(p: number, q: number, e: number, message: number, language: CsLearningLanguage): CryptoDemo {
  const n = p * q;
  const phi = (p - 1) * (q - 1);
  const d = modInverse(e, phi);
  const encrypted = d ? modPow(message, e, n) : 0;
  const decrypted = d ? modPow(encrypted, d, n) : 0;
  const warnings: string[] = [];
  const copy = cryptoDemoCopy[language];
  const rsa = copy.rsa;

  if (!isPrime(p) || !isPrime(q)) warnings.push(rsa.primeWarning);
  if (message >= n) warnings.push(rsa.messageWarning);
  if (!d) warnings.push(rsa.exponentWarning);

  return {
    outputLabel: copy.ciphertext,
    output: d ? String(encrypted) : copy.invalidParameters,
    secondaryLabel: copy.decrypted,
    secondaryOutput: d ? String(decrypted) : undefined,
    warning: warnings.join(' '),
    steps: [
      {
        label: rsa.modulus,
        expression: rsa.modulusExpression(p, q),
        result: String(n),
        note: rsa.modulusNote,
      },
      {
        label: rsa.totient,
        expression: rsa.totientExpression(p, q),
        result: String(phi),
        note: rsa.totientNote,
      },
      {
        label: rsa.privateExponent,
        expression: rsa.privateExponentExpression(e, phi),
        result: d ? String(d) : copy.notFound,
        note: rsa.privateExponentNote,
      },
      {
        label: rsa.encrypt,
        expression: rsa.encryptExpression(message, e, n),
        result: d ? String(encrypted) : copy.invalid,
        note: rsa.encryptNote,
      },
      {
        label: rsa.decrypt,
        expression: d ? rsa.decryptExpression(encrypted, d, n) : copy.invalid,
        result: d ? String(decrypted) : copy.invalid,
        note: rsa.decryptNote,
      },
    ],
  };
}

function diffieHellmanDemo(
  prime: number,
  generator: number,
  alicePrivate: number,
  bobPrivate: number,
  language: CsLearningLanguage
): CryptoDemo {
  const alicePublic = modPow(generator, alicePrivate, prime);
  const bobPublic = modPow(generator, bobPrivate, prime);
  const aliceShared = modPow(bobPublic, alicePrivate, prime);
  const bobShared = modPow(alicePublic, bobPrivate, prime);
  const copy = cryptoDemoCopy[language];
  const dh = copy.diffieHellman;

  return {
    outputLabel: copy.sharedSecret,
    output: String(aliceShared),
    secondaryLabel: copy.bobComputes,
    secondaryOutput: String(bobShared),
    warning: !isPrime(prime) ? dh.primeWarning : undefined,
    steps: [
      {
        label: dh.publicParameters,
        expression: dh.publicParametersExpression(prime, generator),
        result: copy.sharedOpenly,
        note: dh.publicParametersNote,
      },
      {
        label: dh.alicePublic,
        expression: dh.alicePublicExpression(generator, alicePrivate, prime),
        result: String(alicePublic),
        note: dh.alicePublicNote,
      },
      {
        label: dh.bobPublic,
        expression: dh.bobPublicExpression(generator, bobPrivate, prime),
        result: String(bobPublic),
        note: dh.bobPublicNote,
      },
      {
        label: dh.sharedSecret,
        expression: dh.sharedSecretExpression(bobPublic, alicePrivate, prime, alicePublic, bobPrivate),
        result: `${aliceShared} = ${bobShared}`,
        note: dh.sharedSecretNote,
      },
    ],
  };
}

function hashDemo(text: string, language: CsLearningLanguage): CryptoDemo {
  const seed = 2166136261;
  let hash = seed;
  const copy = cryptoDemoCopy[language];
  const hashCopy = copy.hash;
  const steps: CryptoStep[] = [
    {
      label: hashCopy.initialize,
      expression: hashCopy.initializeExpression,
      result: toHex(seed),
      note: hashCopy.initializeNote,
    },
  ];

  Array.from(text).forEach((char, index) => {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;

    if (index < 4) {
      steps.push({
        label: hashCopy.mix(index + 1),
        expression: hashCopy.mixExpression(char.charCodeAt(0)),
        result: toHex(hash),
        note: hashCopy.mixNote(char),
      });
    }
  });

  if (text.length > 4) {
    steps.push({
      label: hashCopy.continueMixing,
      expression: hashCopy.continueExpression(text.length - 4),
      result: toHex(hash),
      note: hashCopy.continueNote,
    });
  }

  return {
    outputLabel: copy.toyHash,
    output: toHex(hash),
    steps,
    warning: hashCopy.warning,
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

function modInverse(value: number, modulus: number) {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 1) return null;

  let previousRemainder = mod(value, modulus);
  let remainder = modulus;
  let previousCoefficient = 1;
  let coefficient = 0;

  while (remainder !== 0) {
    const quotient = Math.floor(previousRemainder / remainder);
    const nextRemainder = previousRemainder - quotient * remainder;
    const nextCoefficient = previousCoefficient - quotient * coefficient;

    previousRemainder = remainder;
    remainder = nextRemainder;
    previousCoefficient = coefficient;
    coefficient = nextCoefficient;
  }

  return previousRemainder === 1 ? mod(previousCoefficient, modulus) : null;
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
