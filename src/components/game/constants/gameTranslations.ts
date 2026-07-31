/**
 * Game translations for English and Japanese
 */

export type GameLanguage = 'en' | 'ja';

export interface GameTranslation {
  title: string;
  description: string;
  longDescription: string;
  howToPlay: string[];
  features: string[];
}

export interface UITranslations {
  gamesCollection: string;
  gamesSubtitle: string;
  interactive: string;
  browserBased: string;
  playNow: string;
  comingSoon: string;
  comingSoonText: string;
  backToPortfolio: string;
  difficulty: string;
  easy: string;
  medium: string;
  hard: string;
  category: string;
  howToPlay: string;
  features: string;
  viewAllGames: string;
  clickToPlay: string;
  closeDialog: string;
  winShort: string;
  lossShort: string;
  drawShort: string;
}

export type JumpGameDifficulty = 'easy' | 'medium' | 'hard';

export interface JumpGameUITranslations {
  stage: string;
  highScore: string;
  muted: string;
  sound: string;
  selectDifficulty: string;
  startGame: string;
  stopGame: string;
  score: string;
  combo: string;
  slowMo: string;
  shield: string;
  invincible: string;
  gameOver: string;
  finalScore: string;
  restartPrompt: string;
  difficulties: Record<JumpGameDifficulty, {
    label: string;
    description: string;
  }>;
  infoSections: Array<{
    title: string;
    description: string;
  }>;
  proTipsTitle: string;
  proTips: string[];
}

export const uiTranslations: Record<GameLanguage, UITranslations> = {
  en: {
    gamesCollection: 'Games Collection',
    gamesSubtitle: 'Pick a quick browser game, learn the rules fast, and chase a better score.',
    interactive: 'Interactive',
    browserBased: 'Browser-Based',
    playNow: 'Play Now',
    comingSoon: 'More games are on the way',
    comingSoonText: 'New browser games and experiments will keep landing here.',
    backToPortfolio: 'Back to Portfolio',
    difficulty: 'Difficulty',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    category: 'Category',
    howToPlay: 'How to Play',
    features: 'Features',
    viewAllGames: 'View All Games',
    clickToPlay: 'Click to Play',
    closeDialog: 'Close dialog',
    winShort: 'W',
    lossShort: 'L',
    drawShort: 'D',
  },
  ja: {
    gamesCollection: 'ゲームコレクション',
    gamesSubtitle: '短時間で遊べるブラウザゲーム集です。ルールをすぐ理解して、より良いスコアを狙えます。',
    interactive: 'インタラクティブ',
    browserBased: 'ブラウザで遊べる',
    playNow: 'プレイする',
    comingSoon: '新しいゲームも追加予定',
    comingSoonText: 'ブラウザで遊べる実験的なゲームを今後も追加していきます。',
    backToPortfolio: 'ポートフォリオに戻る',
    difficulty: '難易度',
    easy: '簡単',
    medium: '普通',
    hard: '難しい',
    category: 'カテゴリー',
    howToPlay: '遊び方',
    features: '特徴',
    viewAllGames: '全てのゲームを見る',
    clickToPlay: 'クリックでプレイ',
    closeDialog: '閉じる',
    winShort: '勝',
    lossShort: '敗',
    drawShort: '分',
  },
};

export const jumpGameUITranslations: Record<GameLanguage, JumpGameUITranslations> = {
  en: {
    stage: 'Stage',
    highScore: 'High Score',
    muted: 'Muted',
    sound: 'Sound',
    selectDifficulty: 'Select Difficulty',
    startGame: 'Start Game',
    stopGame: 'Stop Game',
    score: 'Score',
    combo: 'Combo',
    slowMo: 'Slow-Mo',
    shield: 'Shield',
    invincible: 'Invincible',
    gameOver: 'Game Over',
    finalScore: 'Final Score',
    restartPrompt: 'Press any key to restart',
    difficulties: {
      easy: {
        label: 'Easy',
        description: 'Slower obstacles, perfect for beginners',
      },
      medium: {
        label: 'Medium',
        description: 'Balanced challenge for most players',
      },
      hard: {
        label: 'Hard',
        description: 'Fast-paced, for experienced players',
      },
    },
    infoSections: [
      {
        title: 'Controls',
        description: 'Press any key or tap the canvas to make the blue circle jump',
      },
      {
        title: 'Objective',
        description: 'Avoid the red square obstacles',
      },
      {
        title: 'Scoring',
        description: 'Each successful dodge earns 100 points',
      },
      {
        title: 'Stages',
        description: 'Speed increases every 500 points. Survive as long as you can!',
      },
      {
        title: 'Lives',
        description: 'You have 3 lives. Getting hit loses one life.',
      },
      {
        title: 'Heart Powerup',
        description: 'Red hearts appear every 30 seconds to restore 1 life, up to 3.',
      },
      {
        title: 'Shield Powerup',
        description: 'Green hexagons protect you from one hit for 5 seconds.',
      },
      {
        title: 'Slow-Mo Powerup',
        description: 'Purple diamonds slow down time for 3 seconds.',
      },
      {
        title: 'Combo System',
        description: 'Chain successful dodges to build your combo multiplier.',
      },
    ],
    proTipsTitle: 'Pro Tips',
    proTips: [
      'Easy starts with only ground obstacles, making it good for beginners.',
      'Medium keeps the challenge balanced while difficulty ramps up.',
      'Hard is fast from the start and accelerates quickly.',
      'Use your 3 lives carefully.',
      'Obstacles appear at different heights, so time your jumps deliberately.',
      'Each obstacle has random speed variation.',
      'Collect heart powerups to restore lost lives.',
      'Shield gives you temporary invincibility after getting hit.',
      'Master your timing to survive higher stages.',
    ],
  },
  ja: {
    stage: 'ステージ',
    highScore: 'ハイスコア',
    muted: 'ミュート',
    sound: 'サウンド',
    selectDifficulty: '難易度を選択',
    startGame: 'ゲーム開始',
    stopGame: '停止',
    score: 'スコア',
    combo: 'コンボ',
    slowMo: 'スロー',
    shield: 'シールド',
    invincible: '無敵',
    gameOver: 'ゲームオーバー',
    finalScore: '最終スコア',
    restartPrompt: '任意のキーで再スタート',
    difficulties: {
      easy: {
        label: '簡単',
        description: '障害物が遅く、初めてでも遊びやすい',
      },
      medium: {
        label: '普通',
        description: '多くのプレイヤーに合うバランス型',
      },
      hard: {
        label: '難しい',
        description: '最初から速く、経験者向け',
      },
    },
    infoSections: [
      {
        title: '操作',
        description: '任意のキー、またはキャンバスのタップで青い円をジャンプさせます',
      },
      {
        title: '目的',
        description: '赤い四角の障害物を避けます',
      },
      {
        title: 'スコア',
        description: '障害物を避けるたびに100点入ります',
      },
      {
        title: 'ステージ',
        description: '500点ごとにスピードが上がります。できるだけ長く生き残りましょう。',
      },
      {
        title: 'ライフ',
        description: 'ライフは3つです。障害物に当たると1つ失います。',
      },
      {
        title: 'ハート',
        description: '赤いハートは30秒ごとに出現し、ライフを最大3まで1つ回復します。',
      },
      {
        title: 'シールド',
        description: '緑の六角形は5秒間、1回だけダメージを防ぎます。',
      },
      {
        title: 'スロー',
        description: '紫のダイヤは3秒間、時間の流れを遅くします。',
      },
      {
        title: 'コンボ',
        description: '連続で障害物を避けるとコンボ倍率が上がります。',
      },
    ],
    proTipsTitle: 'コツ',
    proTips: [
      '簡単モードは最初のステージで地上障害物のみ出ます。',
      '普通モードは難易度の上がり方がバランス型です。',
      '難しいモードは最初から速く、加速も急です。',
      '3つのライフを大事に使いましょう。',
      '障害物は高さが変わるので、ジャンプのタイミングをよく見ます。',
      '障害物ごとに少し速度が変わります。',
      'ハートを取ると失ったライフを回復できます。',
      'シールド中は被弾後に少し無敵になります。',
      '高いステージまで生き残るにはタイミングが重要です。',
    ],
  },
};

export const gameTranslations: Record<string, Record<GameLanguage, GameTranslation>> = {
  'jump-game': {
    en: {
      title: 'Jump Game',
      description: 'Time your jumps, clear each obstacle, and keep the run alive for a new high score.',
      longDescription: 'Test your reflexes in this fast-paced endless runner! Your character automatically runs forward while you time your jumps to avoid obstacles. The game speeds up as your score increases, making it progressively more challenging. How far can you go?',
      howToPlay: [
        'Press SPACE or click to jump',
        'Avoid obstacles by timing your jumps',
        'The game speeds up as you progress',
        'Try to beat your high score!',
      ],
      features: [
        'Simple one-button controls',
        'Progressive difficulty',
        'High score tracking',
        'Smooth animations',
      ],
    },
    ja: {
      title: 'ジャンプゲーム',
      description: 'ジャンプのタイミングを合わせて障害物を避け、ハイスコアを狙うランゲーム。',
      longDescription: 'このエンドレスランナーゲームで反射神経をテストしよう！キャラクターは自動的に前に進み、障害物を避けるためにジャンプのタイミングを合わせます。スコアが上がるほどゲームが速くなり、より難しくなります。どこまで行けるかな？',
      howToPlay: [
        'スペースキーまたはクリックでジャンプ',
        'タイミングよくジャンプして障害物を避ける',
        '進むにつれてスピードアップ',
        'ハイスコアを目指そう！',
      ],
      features: [
        'シンプルなワンボタン操作',
        '段階的な難易度上昇',
        'ハイスコア記録',
        'スムーズなアニメーション',
      ],
    },
  },
  'tic-tac-toe': {
    en: {
      title: 'Tic Tac Toe',
      description: 'Play classic tic-tac-toe against an AI with three difficulty levels.',
      longDescription: 'The timeless game of X\'s and O\'s! Play against an AI opponent with three difficulty levels. On Easy, the AI makes random moves. Medium uses basic strategy, while Hard implements the perfect Minimax algorithm - can you force a draw against an unbeatable opponent?',
      howToPlay: [
        'Click on any empty cell to place your mark',
        'Get three in a row (horizontal, vertical, or diagonal) to win',
        'Block your opponent from getting three in a row',
        'Choose your difficulty before starting',
      ],
      features: [
        'Three AI difficulty levels',
        'Perfect Minimax algorithm on Hard',
        'Win/Loss/Draw statistics',
        'Clean, responsive design',
      ],
    },
    ja: {
      title: '三目並べ',
      description: '3段階の難易度から選んで、AIと三目並べをプレイ。',
      longDescription: '誰もが知っている○×ゲーム！3つの難易度のAIと対戦できます。簡単モードではAIはランダムに手を打ちます。普通モードでは基本的な戦略を使い、難しいモードでは完璧なMinimax アルゴリズムを実装 - 無敵のAIに引き分けに持ち込めるかな？',
      howToPlay: [
        '空いているマスをクリックしてマークを置く',
        '縦・横・斜めに3つ並べたら勝ち',
        '相手の3つ並びを阻止する',
        '開始前に難易度を選択',
      ],
      features: [
        '3段階のAI難易度',
        '難しいモードは完璧なMinimaxアルゴリズム',
        '勝敗記録の統計',
        'きれいでレスポンシブなデザイン',
      ],
    },
  },
  'gomoku': {
    en: {
      title: 'Gomoku',
      description: 'Five in a Row! Strategic board game with AI using minimax and alpha-beta pruning. Can you outsmart the algorithm?',
      longDescription: 'Also known as Five in a Row or Gobang, this ancient strategy game originated in Japan. Place stones on a 15x15 board and try to get exactly five in a row before your opponent. Our AI uses the Minimax algorithm with Alpha-Beta pruning for efficient decision making. A perfect blend of simple rules and deep strategy!',
      howToPlay: [
        'Click on any intersection to place your stone',
        'Get exactly five stones in a row to win',
        'Horizontal, vertical, and diagonal lines count',
        'Block your opponent while building your own lines',
      ],
      features: [
        'Advanced AI with Minimax + Alpha-Beta pruning',
        '15x15 traditional board',
        'Move history tracking',
        'Visual winning line highlight',
      ],
    },
    ja: {
      title: '五目並べ',
      description: '5つ並べて勝利！MinimaxとAlpha-Beta枝刈りを使ったAIと対戦する戦略ボードゲーム。',
      longDescription: '五目並べは日本発祥の古典的な戦略ゲームです。15x15の盤面に石を置き、相手より先に5つ並べることを目指します。AIはMinimaxアルゴリズムとAlpha-Beta枝刈りを使用して効率的に意思決定します。シンプルなルールと深い戦略の完璧な融合！',
      howToPlay: [
        '交点をクリックして石を置く',
        '5つ並べたら勝ち',
        '縦・横・斜めすべてカウント',
        '相手を阻止しながら自分のラインを作る',
      ],
      features: [
        'Minimax + Alpha-Beta枝刈りの高度なAI',
        '15x15の伝統的な盤面',
        '手の履歴追跡',
        '勝利ラインのハイライト表示',
      ],
    },
  },
  'tetris': {
    en: {
      title: 'Tetris',
      description: 'Classic block-stacking puzzle game. Clear lines by completing horizontal rows. Speed increases as you level up!',
      longDescription: 'The legendary puzzle game that has captivated players for decades! Rotate and position falling tetrominoes to complete horizontal lines. Clear multiple lines at once for bonus points. Watch out - the pieces fall faster as you level up! Features the classic seven tetromino shapes and ghost piece preview.',
      howToPlay: [
        'Arrow keys: Move left/right and soft drop',
        'Up arrow or Z: Rotate piece',
        'Space: Hard drop (instant placement)',
        'Complete full horizontal lines to clear them',
      ],
      features: [
        'All 7 classic tetromino shapes',
        'Ghost piece preview',
        'Level progression with speed increase',
        'Line clear combos and scoring',
        'Next piece preview',
      ],
    },
    ja: {
      title: 'テトリス',
      description: '定番のブロック積みパズルゲーム。横一列を揃えてラインを消そう。レベルが上がるとスピードアップ！',
      longDescription: '何十年もプレイヤーを魅了してきた伝説のパズルゲーム！落ちてくるテトリミノを回転させて配置し、横一列を揃えて消します。複数のラインを同時に消すとボーナスポイント。レベルが上がるとピースが速く落ちてくるので注意！7種類のテトリミノとゴーストピースプレビュー機能付き。',
      howToPlay: [
        '矢印キー：左右移動とソフトドロップ',
        '上矢印またはZ：ピースを回転',
        'スペース：ハードドロップ（即座に配置）',
        '横一列を揃えてラインを消す',
      ],
      features: [
        '7種類のテトリミノ',
        'ゴーストピースプレビュー',
        'レベル進行とスピードアップ',
        'ライン消しコンボとスコアリング',
        '次のピースプレビュー',
      ],
    },
  },
  'shogi': {
    en: {
      title: 'Shogi',
      description: 'Play Japanese chess against an AI with drops, promotions, and tactical pressure.',
      longDescription: 'Experience the depth of Japanese chess! Unlike Western chess, captured pieces can be dropped back onto the board as your own - adding incredible strategic complexity. Pieces promote when reaching the enemy camp, gaining new powers. Our AI uses advanced evaluation with multiple difficulty levels. Master the way of the general!',
      howToPlay: [
        'Click a piece to select, then click destination',
        'Captured pieces appear in your hand',
        'Drop captured pieces by selecting from your hand',
        'Pieces promote when reaching the last 3 rows',
        'Checkmate the opponent\'s King to win',
      ],
      features: [
        'Full Shogi rules implementation',
        'Piece dropping (unique to Shogi)',
        'Piece promotion system',
        'Multiple AI difficulty levels',
        'Move analysis and suggestions',
      ],
    },
    ja: {
      title: '将棋',
      description: '持ち駒と成りを使いこなし、AIと本格的な将棋を指せます。',
      longDescription: '日本の伝統的な戦略ゲームの奥深さを体験！チェスと違い、取った駒は自分の駒として盤上に打つことができます。敵陣に入ると駒が成って新しい動きができるようになります。AIは複数の難易度レベルで高度な評価を使用。将棋の道を極めよう！',
      howToPlay: [
        '駒をクリックして選択、移動先をクリック',
        '取った駒は駒台に表示',
        '駒台の駒を選んで盤上に打つ',
        '敵陣（奥3列）に入ると成れる',
        '相手の王将を詰めたら勝ち',
      ],
      features: [
        '将棋の完全なルール実装',
        '駒の打ち（将棋独自のルール）',
        '成り駒システム',
        '複数のAI難易度レベル',
        '手の分析と提案',
      ],
    },
  },
  'othello': {
    en: {
      title: 'Othello',
      description: 'Classic strategy board game with AI using alpha-beta search. Flip your opponent\'s discs to win!',
      longDescription: 'Also known as Reversi, this elegant strategy game is simple to learn but difficult to master. Place your disc to flip opponent\'s pieces trapped between your discs. Control the corners and edges for strategic advantage! Our AI uses Alpha-Beta search with position evaluation to provide a challenging opponent.',
      howToPlay: [
        'Click on a valid position to place your disc',
        'Flip opponent\'s discs by trapping them',
        'A move must flip at least one opponent disc',
        'Game ends when neither player can move',
        'Most discs on the board wins!',
      ],
      features: [
        'Alpha-Beta search AI',
        'Valid move highlighting',
        'Disc count display',
        'Strategic corner control',
        'Multiple difficulty levels',
      ],
    },
    ja: {
      title: 'オセロ',
      description: 'Alpha-Beta探索を使ったAIと対戦する定番の戦略ボードゲーム。相手の石を挟んでひっくり返そう！',
      longDescription: 'リバーシとも呼ばれるこのエレガントな戦略ゲームは、学ぶのは簡単ですが極めるのは難しい。自分の石の間に相手の石を挟んでひっくり返します。角と辺を支配して戦略的優位に立とう！AIはAlpha-Beta探索と局面評価を使用して手強い対戦相手となります。',
      howToPlay: [
        '有効な位置をクリックして石を置く',
        '相手の石を挟んでひっくり返す',
        '最低1つの相手の石をひっくり返せる場所のみ有効',
        '両者とも打てなくなったらゲーム終了',
        '石が多い方の勝ち！',
      ],
      features: [
        'Alpha-Beta探索のAI',
        '有効な手のハイライト',
        '石の数の表示',
        '戦略的な角の支配',
        '複数の難易度レベル',
      ],
    },
  },
  'mini-adventure': {
    en: {
      title: 'Mini Adventure',
      description: 'Explore a compact dungeon, manage torchlight, and survive to face the final boss.',
      longDescription: 'Embark on a procedurally generated dungeon adventure! Navigate through 10 increasingly difficult floors, managing your health, torch light, and resources. Encounter various enemies, find treasures, and prepare for the ultimate challenge - the Dragon boss on floor 10! Every run is different thanks to random generation.',
      howToPlay: [
        'Arrow keys or WASD to move',
        'Bump into enemies to attack',
        'Collect items and gold',
        'Manage your torch - darkness is dangerous!',
        'Reach floor 10 and defeat the Dragon',
      ],
      features: [
        'Procedurally generated dungeons',
        'Torch/light management system',
        'Multiple enemy types',
        'Boss battle on floor 10',
        'Permadeath roguelike mechanics',
      ],
    },
    ja: {
      title: 'ミニアドベンチャー',
      description: '小さなダンジョンを探索し、松明と体力を管理してボスを目指すRPG。',
      longDescription: '自動生成されるダンジョン冒険に出発！10階層の難易度が上がるフロアを、体力、松明の光、リソースを管理しながら進みます。様々な敵に遭遇し、宝物を見つけ、究極の挑戦 - 10階のドラゴンボス戦に備えよう！ランダム生成のおかげで毎回違うプレイが楽しめます。',
      howToPlay: [
        '矢印キーまたはWASDで移動',
        '敵にぶつかって攻撃',
        'アイテムとゴールドを収集',
        '松明を管理 - 暗闇は危険！',
        '10階に到達してドラゴンを倒す',
      ],
      features: [
        '自動生成ダンジョン',
        '松明/光管理システム',
        '複数の敵タイプ',
        '10階でボス戦',
        'パーマデスのローグライクメカニクス',
      ],
    },
  },
  'tomoshibi': {
    en: {
      title: 'Tomoshibi — Ruins of the Lantern',
      description: 'A roguelike descent through ten floors. Keep the torch burning — in the dark you can barely see, and every hit hurts more.',
      longDescription: 'A homage to the Fujitsu GAMEPACK roguelike, rebuilt in Godot from what fan guides recorded of the original: the exact damage formulas, the level tables, all eleven monsters with their real stats, and the torch that burns one point a turn and turns the dungeon lethal when it runs out. Levelling matters more than loot — a level is worth six attack. Progress autosaves every turn, and signing in carries the run to another device.',
      howToPlay: [
        'Arrow keys or WASD to move — hold to keep walking',
        'Space attacks whatever you are facing (it can miss)',
        'I opens the bag: read, use, drop or throw',
        'Cards do their work when thrown, sutras when read',
        'Keep the torch above zero and reach the last cave',
      ],
      features: [
        'The original\'s damage formulas and level tables',
        'Eleven monsters, each with its own special attack',
        'Torch as the hunger clock, with real penalties at zero',
        'Autosave every turn; cloud save across devices',
        'Permadeath — dying keeps only the record',
      ],
    },
    ja: {
      title: 'ともしびの遺跡',
      description: '地下10階を下るローグライク。たいまつを絶やすと視界が消え、受けるダメージも増える。',
      longDescription: '富士通GAMEPACKに入っていたローグライクへのオマージュを、有志の攻略サイトに残された記録からGodotで組み直したもの。ダメージ計算式、レベル表、敵11種の数値はすべて原作どおり。たいまつは1ターンに1減り、0になるとダンジョンが一気に危険になる。装備よりレベルが効く(1つ上がるごとに攻撃+6)。1手ごとに自動保存され、ログインすれば別の端末でも続きから遊べる。',
      howToPlay: [
        '矢印キー / WASD で移動(押しっぱなしで歩き続ける)',
        'スペースで向いている方向を斬る(空振りもある)',
        'I で持ち物 — よむ / つかう / おく / なげる',
        'カードは投げて使う。経典は読んで使う',
        'たいまつを絶やさず、最後の洞窟まで潜る',
      ],
      features: [
        '原作のダメージ計算式とレベル表を再現',
        '敵11種。それぞれ固有の特殊攻撃を持つ',
        'たいまつが空腹度の役。0でのペナルティも再現',
        '毎ターン自動保存。端末をまたいだクラウドセーブ',
        'ローグライクなので、死ぬと記録だけが残る',
      ],
    },
  },
  'breakout': {
    en: {
      title: 'Breakout',
      description: 'Classic brick-breaking arcade game! Use your paddle to bounce the ball and destroy all bricks. Collect power-ups!',
      longDescription: 'The arcade classic that started it all! Control your paddle to keep the ball in play and break all the bricks. Different colored bricks have different durability. Collect falling power-ups for paddle size changes, multi-ball, and more! Clear all bricks to advance to the next level.',
      howToPlay: [
        'Move mouse or arrow keys to control paddle',
        'Bounce the ball to break bricks',
        'Catch falling power-ups',
        'Don\'t let the ball fall below the paddle!',
        'Break all bricks to win',
      ],
      features: [
        'Multiple brick types with different HP',
        'Power-up system',
        'Level progression',
        'Score multipliers',
        'Smooth paddle controls',
      ],
    },
    ja: {
      title: 'ブロック崩し',
      description: '定番のブロック崩しゲーム！パドルでボールを跳ね返してブロックを壊そう。パワーアップも集めよう！',
      longDescription: 'アーケードゲームの原点！パドルを操作してボールを落とさないようにしながら、すべてのブロックを壊します。色によってブロックの耐久度が異なります。落ちてくるパワーアップをキャッチして、パドルサイズ変更やマルチボールなどを獲得！全ブロックを壊して次のレベルへ。',
      howToPlay: [
        'マウスまたは矢印キーでパドルを操作',
        'ボールを跳ね返してブロックを壊す',
        '落ちてくるパワーアップをキャッチ',
        'ボールを落とさないように！',
        '全ブロックを壊したら勝ち',
      ],
      features: [
        '異なるHPを持つ複数のブロック',
        'パワーアップシステム',
        'レベル進行',
        'スコア倍率',
        'スムーズなパドル操作',
      ],
    },
  },
  'space-invaders': {
    en: {
      title: 'Space Invaders',
      description: 'Defend Earth from alien invasion! Destroy waves of enemies, use shields for cover, and shoot the mystery UFO for bonus points.',
      longDescription: 'The legendary 1978 arcade shooter comes to your browser! Defend Earth against waves of descending aliens. Use your destructible shields for cover, and don\'t miss the mystery UFO flying across the top for bonus points! As waves progress, aliens move faster and become more aggressive. How many waves can you survive?',
      howToPlay: [
        'Arrow keys: Move left/right',
        'Space: Fire laser',
        'Destroy all aliens to complete the wave',
        'Use shields for protection',
        'Shoot the mystery UFO for bonus points',
      ],
      features: [
        'Classic wave-based gameplay',
        'Destructible shield barriers',
        'Mystery UFO bonus',
        'Progressive difficulty',
        'Retro pixel graphics',
      ],
    },
    ja: {
      title: 'スペースインベーダー',
      description: '地球をエイリアンの侵略から守れ！敵の波を破壊し、シールドで身を守り、UFOを撃ってボーナスポイントを獲得！',
      longDescription: '1978年の伝説的なアーケードシューターがブラウザに！迫り来るエイリアンの波から地球を守ります。破壊可能なシールドで身を守り、画面上部を飛ぶミステリーUFOを撃ってボーナスポイントを獲得！ウェーブが進むにつれてエイリアンはより速く、より攻撃的になります。何ウェーブ生き残れるかな？',
      howToPlay: [
        '矢印キー：左右移動',
        'スペース：レーザー発射',
        '全エイリアンを倒してウェーブクリア',
        'シールドで身を守る',
        'ミステリーUFOを撃ってボーナス',
      ],
      features: [
        'クラシックなウェーブ制ゲームプレイ',
        '破壊可能なシールドバリア',
        'ミステリーUFOボーナス',
        '段階的な難易度上昇',
        'レトロなドット絵グラフィック',
      ],
    },
  },
  'territory-number': {
    en: {
      title: 'Territory Number',
      description: 'Place number cards on a 3x3 board and capture the most scoring lines.',
      longDescription: 'A 2-player tactical game on a 3x3 grid. Pick unused numbers from 1-9, place them on the board, and compete for rows, columns, and diagonals. Strong numbers matter, but placement matters more.',
      howToPlay: [
        'Take turns picking any unused number from 1–9',
        'Place it on any empty cell, in your colour',
        'After all 9 cells are filled, score 8 lines (3 rows, 3 cols, 2 diagonals)',
        'Each line goes to whoever has the higher sum on it',
        'Most captured lines wins; ties give a draw',
        'Centre cell hits 4 lines, corners 3, edges 2 — placement matters',
      ],
      features: [
        'Vs AI mode (Easy / Medium / Hard with alpha-beta minimax)',
        'Online 2-player with shared room codes',
        'Configurable first-player rule (host / guest / random)',
        'Live line-capture summary as you play',
      ],
    },
    ja: {
      title: '陣取り数字',
      description: '3x3の盤面に数字カードを置き、合計値でより多くのラインを取る戦略ゲーム。',
      longDescription: '3×3のマスに交互で数字カード（1〜9）を置いていく2人用の戦略ゲーム。共有プールから1枚選んで空いているマスに自分の色で置きます。9マス埋まった後、各行・列・斜めの合計が大きい方がそのラインを獲得。獲得ライン数が多い方が勝ち。数字の強さだけじゃなく、置く場所が重要。三目並べ＋数字バトルのようなゲーム性。',
      howToPlay: [
        '共有プール（1〜9）から交互に1枚選ぶ',
        '空いているマスに自分の色で置く',
        '9マス埋まったら8ライン（行3＋列3＋斜め2）を採点',
        '各ラインで合計が大きい方がそのラインを獲得',
        '獲得ライン数が多い方が勝ち。同数なら引き分け',
        '中央マスは4ライン、コーナーは3ライン、辺は2ライン — 置く場所が重要',
      ],
      features: [
        'AI対戦モード（弱い／普通／強いはαβ枝刈りミニマックス）',
        '2人オンライン対戦（ルームコード共有）',
        '先手設定（ホスト／ゲスト／ランダム）',
        'ライン獲得サマリーをリアルタイムに表示',
      ],
    },
  },
  'bigger-number': {
    en: {
      title: 'Bigger Number',
      description: 'Reveal numbered tiles at the same time; the higher number wins the round.',
      longDescription: 'A 2-player mind game where each side holds tiles 1-9 plus one Dragon. Pick secretly, reveal together, and decide when to spend your strongest tiles. Play vs AI or online with a room code.',
      howToPlay: [
        'Each player starts with tiles 1-9 plus a Dragon',
        'Pick one tile per round; both reveal simultaneously',
        'Higher number wins the round',
        'Dragon: by default loses to 1, beats everything else',
        'First to 5 wins (or whatever the room rules say)',
        'Read your opponent — are they saving their 9?',
      ],
      features: [
        'Vs AI mode (Easy / Medium / Hard)',
        'Online 2-player with shared room codes',
        'Configurable rules: Dragon behavior, ties, win threshold',
        'Hard AI uses opponent-modelling expected value',
      ],
    },
    ja: {
      title: '大きい数字を出せ',
      description: '数字タイルを同時に公開し、より大きい数字でラウンドを取る読み合いゲーム。',
      longDescription: '2人用の読み合いゲーム。それぞれ1〜9の数字タイルと龍タイル1枚を持ちます。毎ラウンド、両者がタイルを伏せて選び、同時にオープン。大きい数字を出した方が勝ち、龍タイルには特殊ルールがあります。先にN勝（設定可能）した方が勝者。AI対戦（難易度3段階）またはルームコードを共有してオンライン対戦が可能。',
      howToPlay: [
        '各プレイヤーは1〜9の数字タイルと龍タイル1枚を持ちます',
        '毎ラウンド、1枚を選んで同時にオープン',
        '大きい数字を出した方が勝ち',
        '龍タイルはデフォルトで1にだけ負け、他には勝ちます',
        '先に5勝で勝利（ルームルールで変更可）',
        '相手は強い札を温存しているか？読み合いを楽しもう',
      ],
      features: [
        'AI対戦モード（弱い／普通／強い）',
        '2人オンライン対戦（ルームコード共有）',
        '設定可能なルール：龍タイル挙動、引き分け処理、勝利点数',
        '強いAIは相手の手札を推定して期待値で選択',
      ],
    },
  },
  'daifugo': {
    en: {
      title: 'Daifugo',
      description: 'Race to empty your hand in Daifugo, solo against AI or online with friends.',
      longDescription: 'The popular Japanese card game also known as "Rich Man, Poor Man"! Play against AI opponents or challenge friends online. Features include Revolution, Eight-cut, Eleven-back, Suit lock (Shibari), and Gekishiba. The goal is to be the first to empty your hand. Rankings carry over between rounds with card exchanges!',
      howToPlay: [
        'Play cards that beat the previous play',
        'Same suit consecutive = Shibari (suit lock)',
        'Same suit + consecutive rank = Gekishiba (exact rank required)',
        'Play 4+ cards for Revolution (reverses strength)',
        'J triggers Eleven-back (temporary reverse)',
        '8 clears the table (Eight-cut)',
        'First to empty hand becomes Daifugo!',
      ],
      features: [
        'VS AI mode (3-6 players)',
        'Online multiplayer (3-6 players)',
        'Full Japanese rules: Revolution, 8-cut, 11-back',
        'Shibari (suit lock) and Gekishiba (intense lock)',
        '7-give, 10-discard special rules',
        'Card exchange between rounds',
      ],
    },
    ja: {
      title: '大富豪',
      description: 'AIまたはオンラインで大富豪を遊び、最初に手札を出し切ることを目指します。',
      longDescription: '日本の人気カードゲーム！AIと対戦するか、オンラインで友達と対戦しましょう。革命、8切り、11バック、縛り（しばり）、激縛りなどの機能を搭載。目標は最初に手札をなくすこと。ラウンド間でランキングが引き継がれ、カード交換が行われます！',
      howToPlay: [
        '場のカードより強いカードを出す',
        '同じマーク連続 = 縛り（スート固定）',
        '同じマーク＋連続ランク = 激縛り（そのランクのみ）',
        '4枚以上で革命（強さ逆転）',
        'Jで11バック（一時的に逆転）',
        '8で場を流す（8切り）',
        '最初に上がった人が大富豪！',
      ],
      features: [
        'AI対戦モード（3〜6人）',
        'オンラインマルチプレイ（3〜6人）',
        '日本のルール完全対応：革命、8切り、11バック',
        '縛りと激縛り',
        '7渡し、10捨ての特殊ルール',
        'ラウンド間のカード交換',
      ],
    },
  },
};

export function getGameTranslation(gameId: string, lang: GameLanguage): GameTranslation {
  const game = gameTranslations[gameId];
  if (!game) {
    return {
      title: gameId,
      description: '',
      longDescription: '',
      howToPlay: [],
      features: [],
    };
  }
  return game[lang];
}

export function getUITranslation(lang: GameLanguage): UITranslations {
  return uiTranslations[lang];
}

export function getJumpGameUITranslation(lang: GameLanguage): JumpGameUITranslations {
  return jumpGameUITranslations[lang];
}

export function getDifficultyLabel(difficulty: 'Easy' | 'Medium' | 'Hard', lang: GameLanguage): string {
  const labels: Record<'Easy' | 'Medium' | 'Hard', Record<GameLanguage, string>> = {
    Easy: { en: 'Easy', ja: '簡単' },
    Medium: { en: 'Medium', ja: '普通' },
    Hard: { en: 'Hard', ja: '難しい' },
  };
  return labels[difficulty][lang];
}

export function getCategoryLabel(category: string, lang: GameLanguage): string {
  const categories: Record<string, Record<GameLanguage, string>> = {
    Arcade: { en: 'Arcade', ja: 'アーケード' },
    Strategy: { en: 'Strategy', ja: '戦略' },
    Puzzle: { en: 'Puzzle', ja: 'パズル' },
    RPG: { en: 'RPG', ja: 'RPG' },
    Card: { en: 'Card', ja: 'カード' },
  };
  return categories[category]?.[lang] ?? category;
}

// Daifugo in-game UI translations
export interface DaifugoUITranslations {
  // Setup screen
  vsAI: string;
  online: string;
  chooseAICount: string;
  yourName: string;
  aiPlayers: string;
  total: string;
  startGame: string;
  back: string;
  // Game screen
  round: string;
  yourTurn: string;
  playerTurn: string;
  result: string;
  isDaifugo: string;
  finished: string;
  results: string;
  // Buttons
  pass: string;
  play: string;
  clear: string;
  nextRound: string;
  newGame: string;
  // Hand section
  yourHand: string;
  selectCards: string;
  selectedStraight: string;
  selectedGroup: string;
  // 7渡し / 10捨て
  sevenGive: string;
  sevenGiveDesc: string;
  giveToPlayer: string;
  tenDiscard: string;
  tenDiscardDesc: string;
  discardUpTo: string;
  // Log
  log: string;
  noActionsYet: string;
  logPass: string;
  logTableCleared: string;
  logRoundEnd: string;
  logNextRound: string;
  // Rank labels
  daifugo: string;
  fugo: string;
  heimin: string;
  hinmin: string;
  daihinmin: string;
  // Status indicators
  revolution: string;
  elevenBack: string;
  shibari: string;
  gekishiba: string;
  rankOnly: string;
  // Table view
  cards: string;
  finishedLabel: string;
  anyCard: string;
  tableCard: string;
  weak: string;
  strong: string;
  passLabel: string;
  players: string;
  you: string;
}

export const daifugoUITranslations: Record<GameLanguage, DaifugoUITranslations> = {
  en: {
    // Setup screen
    vsAI: 'Daifugo vs AI',
    online: 'Daifugo Online',
    chooseAICount: 'Choose AI count (min 2, max 5) — total 3–6 players.',
    yourName: 'Your name',
    aiPlayers: 'AI players',
    total: 'total',
    startGame: 'Start Game',
    back: 'Back',
    // Game screen
    round: 'Round',
    yourTurn: 'Your turn',
    playerTurn: "'s turn",
    result: 'Result',
    isDaifugo: 'is Daifugo',
    finished: 'Finished',
    results: 'Results',
    // Buttons
    pass: 'Pass',
    play: 'Play',
    clear: 'Clear',
    nextRound: 'Next Round',
    newGame: 'New Game',
    // Hand section
    yourHand: 'Your Hand',
    selectCards: 'Select cards to play',
    selectedStraight: 'Selected: straight',
    selectedGroup: 'Selected:',
    // 7渡し / 10捨て
    sevenGive: '7-Give',
    sevenGiveDesc: 'Select cards to give (unselected will auto-pick weakest)',
    giveToPlayer: 'Give {count} card(s) to {player}',
    tenDiscard: '10-Discard',
    tenDiscardDesc: 'Select cards to discard (optional)',
    discardUpTo: 'Discard up to {count} card(s)',
    // Log
    log: 'Log',
    noActionsYet: 'No actions yet',
    logPass: 'pass',
    logTableCleared: 'table cleared',
    logRoundEnd: 'round end',
    logNextRound: 'next round',
    // Rank labels
    daifugo: 'Daifugo',
    fugo: 'Fugo',
    heimin: 'Heimin',
    hinmin: 'Hinmin',
    daihinmin: 'Daihinmin',
    // Status indicators
    revolution: 'Revolution',
    elevenBack: '11-Back',
    shibari: 'Shibari',
    gekishiba: 'Gekishiba',
    rankOnly: 'only',
    // Table view
    cards: 'cards',
    finishedLabel: 'finished',
    anyCard: 'Anything OK',
    tableCard: 'Table',
    weak: 'Weak',
    strong: 'Strong',
    passLabel: 'Pass:',
    players: 'players',
    you: 'You',
  },
  ja: {
    // Setup screen
    vsAI: '大富豪 vs AI',
    online: '大富豪 オンライン',
    chooseAICount: 'AIの人数を選択（2〜5人）— 合計3〜6人。',
    yourName: 'あなたの名前',
    aiPlayers: 'AIプレイヤー',
    total: '合計',
    startGame: 'ゲーム開始',
    back: '戻る',
    // Game screen
    round: 'ラウンド',
    yourTurn: 'あなたのターン',
    playerTurn: 'のターン',
    result: '結果',
    isDaifugo: 'が大富豪',
    finished: '終了',
    results: '結果',
    // Buttons
    pass: 'パス',
    play: '出す',
    clear: 'クリア',
    nextRound: '次のラウンド',
    newGame: '新しいゲーム',
    // Hand section
    yourHand: 'あなたの手札',
    selectCards: 'カードを選択してください',
    selectedStraight: '選択中: 階段',
    selectedGroup: '選択中:',
    // 7渡し / 10捨て
    sevenGive: '7渡し',
    sevenGiveDesc: '渡すカードを選択（未選択分は自動で弱いカードになります）',
    giveToPlayer: '{count}枚を{player}に渡す',
    tenDiscard: '10捨て',
    tenDiscardDesc: '捨てるカードを選択（選択しなければ捨てません）',
    discardUpTo: '最大{count}枚を捨てられます',
    // Log
    log: 'ログ',
    noActionsYet: 'まだアクションがありません',
    logPass: 'パス',
    logTableCleared: '場を流した',
    logRoundEnd: 'ラウンド終了',
    logNextRound: '次のラウンド',
    // Rank labels
    daifugo: '大富豪',
    fugo: '富豪',
    heimin: '平民',
    hinmin: '貧民',
    daihinmin: '大貧民',
    // Status indicators
    revolution: '革命',
    elevenBack: '11バック',
    shibari: '縛り',
    gekishiba: '激縛り',
    rankOnly: 'のみ',
    // Table view
    cards: '枚',
    finishedLabel: 'あがり',
    anyCard: '何でもOK',
    tableCard: '場札',
    weak: '弱',
    strong: '強',
    passLabel: 'パス:',
    players: '人',
    you: 'あなた',
  },
};

export function getDaifugoUITranslation(lang: GameLanguage): DaifugoUITranslations {
  return daifugoUITranslations[lang];
}
