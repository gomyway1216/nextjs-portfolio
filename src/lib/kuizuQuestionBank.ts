import { QuizCategory, QuizDifficulty, QuestionType } from '@/types/kuizu';
import type { Question } from '@/types/kuizu';

let questionCounter = 0;
function q(partial: Omit<Question, 'id'>): Question {
  return { id: `builtin_${++questionCounter}`, ...partial };
}

// Helper shorthand
const C = QuizCategory;
const D = QuizDifficulty;
const T = QuestionType;

function fc(cat: QuizCategory, diff: QuizDifficulty, text: string, opts: [string,string,string,string], correct: 'a'|'b'|'c'|'d', expl: string, tags: string[] = []): Question {
  return q({ type: T.FOUR_CHOICE, category: cat, difficulty: diff, questionText: text, options: [{id:'a',text:opts[0]},{id:'b',text:opts[1]},{id:'c',text:opts[2]},{id:'d',text:opts[3]}], correctOptionId: correct, explanation: expl, tags });
}

function tf(cat: QuizCategory, diff: QuizDifficulty, text: string, correct: boolean, expl: string, tags: string[] = []): Question {
  return q({ type: T.TRUE_FALSE, category: cat, difficulty: diff, questionText: text, options: [{id:'true',text:'True'},{id:'false',text:'False'}], correctOptionId: correct ? 'true' : 'false', explanation: expl, tags });
}

function fb(cat: QuizCategory, diff: QuizDifficulty, text: string, answer: string, alts: string[], expl: string, tags: string[] = []): Question {
  return q({ type: T.FILL_IN_BLANK, category: cat, difficulty: diff, questionText: text, options: [], correctOptionId: '', correctText: answer, acceptableAnswers: alts, explanation: expl, tags });
}

export const QUESTION_BANK: Question[] = [
  // ========================================================================
  // ENGLISH VOCABULARY (45 questions)
  // ========================================================================
  // Easy (15)
  fc(C.ENGLISH_VOCAB, D.EASY, 'What is the meaning of "happy"?', ['Sad','Angry','Joyful','Tired'], 'c', '"Happy" means feeling joy or pleasure.', ['basic','emotion']),
  fc(C.ENGLISH_VOCAB, D.EASY, 'Which word is the opposite of "big"?', ['Large','Small','Tall','Wide'], 'b', '"Small" is the antonym of "big".', ['antonym','basic']),
  fc(C.ENGLISH_VOCAB, D.EASY, 'What does "beautiful" mean?', ['Ugly','Pretty','Fast','Strong'], 'b', '"Beautiful" means very attractive or pleasing.', ['adjective','basic']),
  tf(C.ENGLISH_VOCAB, D.EASY, '"Dog" is a noun.', true, 'A dog is a thing, so it is a noun.', ['grammar','basic']),
  tf(C.ENGLISH_VOCAB, D.EASY, '"Quickly" is an adjective.', false, '"Quickly" is an adverb, not an adjective.', ['grammar','basic']),
  fc(C.ENGLISH_VOCAB, D.EASY, 'What is the plural of "child"?', ['Childs','Children','Childes','Childen'], 'b', '"Children" is the irregular plural of "child".', ['plural','basic']),
  fc(C.ENGLISH_VOCAB, D.EASY, 'Which word means "not difficult"?', ['Hard','Easy','Complex','Tough'], 'b', '"Easy" means not difficult.', ['synonym','basic']),
  fb(C.ENGLISH_VOCAB, D.EASY, 'Complete: "She ___ to school every day."', 'goes', ['walks','goes'], 'Third person singular present tense of "go" is "goes".', ['verb','grammar']),
  fc(C.ENGLISH_VOCAB, D.EASY, 'What color do you get mixing red and white?', ['Orange','Purple','Pink','Brown'], 'c', 'Red and white make pink.', ['color','basic']),
  tf(C.ENGLISH_VOCAB, D.EASY, '"Receive" is spelled correctly.', true, '"Receive" follows the "i before e except after c" rule.', ['spelling']),
  fc(C.ENGLISH_VOCAB, D.EASY, 'What is the past tense of "eat"?', ['Eated','Ate','Eaten','Eating'], 'b', 'The past tense of "eat" is "ate".', ['verb','tense']),
  fc(C.ENGLISH_VOCAB, D.EASY, 'Which is a fruit?', ['Carrot','Potato','Apple','Onion'], 'c', 'An apple is a fruit; the others are vegetables.', ['noun','food']),
  fb(C.ENGLISH_VOCAB, D.EASY, 'The opposite of "hot" is ___.', 'cold', ['cold','cool'], '"Cold" is the most common antonym of "hot".', ['antonym']),
  tf(C.ENGLISH_VOCAB, D.EASY, '"They\'re" means "they are".', true, '"They\'re" is a contraction of "they are".', ['contraction','grammar']),
  fc(C.ENGLISH_VOCAB, D.EASY, 'Which sentence is correct?', ['I is happy','I am happy','I are happy','I be happy'], 'b', '"I am" is the correct subject-verb agreement.', ['grammar']),
  // Normal (15)
  fc(C.ENGLISH_VOCAB, D.NORMAL, 'What does "ambiguous" mean?', ['Clear','Uncertain','Bright','Angry'], 'b', '"Ambiguous" means having more than one possible meaning.', ['advanced','adjective']),
  fc(C.ENGLISH_VOCAB, D.NORMAL, 'Choose the correct word: "The news ___ surprising."', ['were','are','was','have'], 'c', '"News" is uncountable and takes a singular verb.', ['grammar']),
  fc(C.ENGLISH_VOCAB, D.NORMAL, 'What is a synonym for "brave"?', ['Cowardly','Courageous','Timid','Weak'], 'b', '"Courageous" is a synonym for "brave".', ['synonym']),
  tf(C.ENGLISH_VOCAB, D.NORMAL, '"Affect" and "effect" have the same meaning.', false, '"Affect" is usually a verb; "effect" is usually a noun.', ['confusing_words']),
  fb(C.ENGLISH_VOCAB, D.NORMAL, 'Complete the idiom: "Break the ___."', 'ice', ['ice'], '"Break the ice" means to relieve tension in social situations.', ['idiom']),
  fc(C.ENGLISH_VOCAB, D.NORMAL, 'Which word means "to make something better"?', ['Worsen','Improve','Destroy','Ignore'], 'b', '"Improve" means to make better.', ['verb']),
  fc(C.ENGLISH_VOCAB, D.NORMAL, '"She looked at ___ in the mirror." Choose the correct pronoun.', ['her','she','hers','herself'], 'd', 'Reflexive pronoun "herself" is needed here.', ['pronoun','grammar']),
  tf(C.ENGLISH_VOCAB, D.NORMAL, 'The word "irregardless" is considered standard English.', false, '"Irregardless" is non-standard; "regardless" is correct.', ['usage']),
  fc(C.ENGLISH_VOCAB, D.NORMAL, 'What does the prefix "un-" mean?', ['Again','Before','Not','After'], 'c', 'The prefix "un-" means "not" (e.g., unhappy = not happy).', ['prefix']),
  fb(C.ENGLISH_VOCAB, D.NORMAL, 'The comparative form of "good" is ___.', 'better', ['better'], '"Good" has an irregular comparative form: "better".', ['comparative']),
  fc(C.ENGLISH_VOCAB, D.NORMAL, 'Which sentence uses "their" correctly?', ['Their going home','They left their bags','Their is a problem','Their the best'], 'b', '"Their" is a possessive pronoun meaning "belonging to them".', ['homophone']),
  fc(C.ENGLISH_VOCAB, D.NORMAL, 'What does "procrastinate" mean?', ['To hurry','To delay','To finish','To begin'], 'b', '"Procrastinate" means to delay or postpone action.', ['verb','advanced']),
  tf(C.ENGLISH_VOCAB, D.NORMAL, 'A "paragraph" contains at least one sentence.', true, 'A paragraph is a group of related sentences about one topic.', ['writing']),
  fc(C.ENGLISH_VOCAB, D.NORMAL, 'Which is the correct spelling?', ['Neccessary','Necessary','Neccesary','Necesary'], 'b', '"Necessary" – one C and two S\'s.', ['spelling']),
  fb(C.ENGLISH_VOCAB, D.NORMAL, '"Look ___" means to be careful.', 'out', ['out'], '"Look out" is a phrasal verb meaning to be careful.', ['phrasal_verb']),
  // Hard (15)
  fc(C.ENGLISH_VOCAB, D.HARD, 'What does "ubiquitous" mean?', ['Rare','Present everywhere','Ancient','Dangerous'], 'b', '"Ubiquitous" means found or existing everywhere.', ['advanced']),
  fc(C.ENGLISH_VOCAB, D.HARD, 'Which word means "a feeling of great happiness"?', ['Melancholy','Euphoria','Apathy','Lethargy'], 'b', '"Euphoria" is a state of intense happiness.', ['advanced','emotion']),
  tf(C.ENGLISH_VOCAB, D.HARD, '"Inflammable" means the same as "flammable".', true, 'Both words mean easily set on fire. The "in-" prefix is not negative here.', ['confusing_words']),
  fc(C.ENGLISH_VOCAB, D.HARD, 'What is the subjunctive mood used for?', ['Past actions','Wishes and hypotheticals','Future plans','Commands'], 'b', 'The subjunctive expresses wishes, demands, or hypothetical situations.', ['grammar','advanced']),
  fb(C.ENGLISH_VOCAB, D.HARD, 'The word meaning "government by the people" is ___.', 'democracy', ['democracy'], '"Democracy" comes from Greek: demos (people) + kratos (rule).', ['vocabulary']),
  fc(C.ENGLISH_VOCAB, D.HARD, '"Ephemeral" most closely means:', ['Permanent','Short-lived','Beautiful','Mysterious'], 'b', '"Ephemeral" means lasting for a very short time.', ['advanced']),
  fc(C.ENGLISH_VOCAB, D.HARD, 'Which is an example of an oxymoron?', ['Very happy','Jumbo shrimp','Red car','Fast runner'], 'b', 'An oxymoron combines contradictory terms: "jumbo" (big) + "shrimp" (small).', ['literary_device']),
  tf(C.ENGLISH_VOCAB, D.HARD, 'English has more words than any other language.', true, 'English has the largest vocabulary of any language, estimated at over 1 million words.', ['trivia']),
  fc(C.ENGLISH_VOCAB, D.HARD, 'What does "sycophant" mean?', ['A leader','A flatterer','A teacher','A warrior'], 'b', 'A sycophant is someone who flatters for personal gain.', ['advanced']),
  fb(C.ENGLISH_VOCAB, D.HARD, 'A word that is spelled the same forwards and backwards is a ___.', 'palindrome', ['palindrome'], 'Examples: "racecar", "level", "noon".', ['word_type']),
  fc(C.ENGLISH_VOCAB, D.HARD, 'Which sentence contains a dangling modifier?', ['Running quickly, the dog caught the ball.','Running quickly, the finish line was crossed.','She ran quickly to the store.','The cat ran quickly.'], 'b', 'In B, "running quickly" has no clear subject performing the action.', ['grammar']),
  tf(C.ENGLISH_VOCAB, D.HARD, 'The word "set" has the most definitions of any English word.', true, '"Set" has over 400 definitions in the Oxford English Dictionary.', ['trivia']),
  fc(C.ENGLISH_VOCAB, D.HARD, 'What rhetorical device repeats the same word at the start of successive clauses?', ['Alliteration','Anaphora','Metaphor','Hyperbole'], 'b', 'Anaphora: "I have a dream... I have a dream..." (MLK)', ['literary_device']),
  fc(C.ENGLISH_VOCAB, D.HARD, '"Pusillanimous" most nearly means:', ['Brave','Timid','Loud','Generous'], 'b', '"Pusillanimous" means showing a lack of courage.', ['advanced']),
  fb(C.ENGLISH_VOCAB, D.HARD, 'The study of word origins is called ___.', 'etymology', ['etymology'], 'Etymology traces the history and origins of words.', ['linguistics']),

  // ========================================================================
  // TRAIN & STATION (40 questions)
  // ========================================================================
  // Easy (15)
  fc(C.TRAIN_STATION, D.EASY, 'What color is the Yamanote Line?', ['Red','Blue','Green','Yellow'], 'c', 'The Yamanote Line is represented by light green (yellow-green).', ['yamanote','color']),
  fc(C.TRAIN_STATION, D.EASY, 'Which is the busiest station in Japan?', ['Tokyo','Shibuya','Shinjuku','Ikebukuro'], 'c', 'Shinjuku Station handles over 3.5 million passengers daily.', ['station','record']),
  tf(C.TRAIN_STATION, D.EASY, 'The Shinkansen is also known as the bullet train.', true, 'The Shinkansen is Japan\'s high-speed rail, nicknamed the bullet train.', ['shinkansen']),
  fc(C.TRAIN_STATION, D.EASY, 'What does "JR" stand for?', ['Japan Rail','Japan Railways','Japanese Route','Japan Road'], 'b', 'JR stands for Japan Railways, privatized in 1987.', ['jr','basic']),
  fc(C.TRAIN_STATION, D.EASY, 'Which line connects Tokyo and Osaka via Shinkansen?', ['Tohoku','Tokaido','Hokuriku','Joetsu'], 'b', 'The Tokaido Shinkansen runs between Tokyo and Shin-Osaka.', ['shinkansen','route']),
  tf(C.TRAIN_STATION, D.EASY, 'Suica is an IC card used for train fare in Japan.', true, 'Suica is a rechargeable smart card issued by JR East.', ['ic_card']),
  fc(C.TRAIN_STATION, D.EASY, 'What is the famous crossing near Shibuya Station?', ['Tokyo Crossing','Shibuya Scramble','Ginza Walk','Shinjuku Cross'], 'b', 'The Shibuya Scramble is one of the busiest crossings in the world.', ['shibuya']),
  fb(C.TRAIN_STATION, D.EASY, 'The Tokyo Metro line that is colored orange is the ___ Line.', 'Ginza', ['Ginza','ginza'], 'The Ginza Line, Tokyo\'s oldest subway line, is represented by orange.', ['metro','color']),
  fc(C.TRAIN_STATION, D.EASY, 'How many stations does the Yamanote Line have?', ['20','25','30','35'], 'c', 'The Yamanote Line has 30 stations forming a loop in central Tokyo.', ['yamanote']),
  tf(C.TRAIN_STATION, D.EASY, 'The Yamanote Line runs in a circle (loop).', true, 'The Yamanote Line forms a loop around central Tokyo.', ['yamanote']),
  fc(C.TRAIN_STATION, D.EASY, 'Which company operates the Tokyo Metro?', ['JR East','Tokyo Metro Co.','Toei','Keio'], 'b', 'Tokyo Metro Co., Ltd. operates the Tokyo Metro lines.', ['operator']),
  fc(C.TRAIN_STATION, D.EASY, 'What is the name of Japan\'s magnetic levitation train?', ['Nozomi','Hikari','Linear Chuo','Kodama'], 'c', 'The Linear Chuo Shinkansen uses maglev technology.', ['maglev']),
  tf(C.TRAIN_STATION, D.EASY, 'You can use PASMO on JR trains.', true, 'PASMO and Suica are interchangeable on most trains in Tokyo.', ['ic_card']),
  fc(C.TRAIN_STATION, D.EASY, 'Tokyo Station is in which ward?', ['Shibuya','Chiyoda','Shinjuku','Minato'], 'b', 'Tokyo Station is located in Chiyoda ward.', ['tokyo_station']),
  fb(C.TRAIN_STATION, D.EASY, 'The fastest Shinkansen service is called ___.', 'Nozomi', ['Nozomi','nozomi'], 'Nozomi is the fastest Tokaido Shinkansen service.', ['shinkansen']),
  // Normal (15)
  fc(C.TRAIN_STATION, D.NORMAL, 'How long does the Nozomi take from Tokyo to Shin-Osaka?', ['1 hour','2 hours 15 min','3 hours','4 hours'], 'b', 'The Nozomi takes approximately 2 hours 15 minutes.', ['shinkansen','time']),
  fc(C.TRAIN_STATION, D.NORMAL, 'Which line is colored blue on Tokyo Metro maps?', ['Marunouchi','Tozai','Chiyoda','Hanzomon'], 'b', 'The Tozai Line is represented by sky blue.', ['metro','color']),
  tf(C.TRAIN_STATION, D.NORMAL, 'The Ginza Line was Japan\'s first subway line.', true, 'Opened in 1927, the Ginza Line was the first subway in East Asia.', ['metro','history']),
  fc(C.TRAIN_STATION, D.NORMAL, 'Which station is the main hub for the Chuo Line?', ['Shinjuku','Tokyo','Shibuya','Ueno'], 'b', 'The Chuo Line starts at Tokyo Station heading west.', ['chuo','route']),
  fb(C.TRAIN_STATION, D.NORMAL, 'The Marunouchi Line color is ___.', 'red', ['red','scarlet'], 'The Marunouchi Line is represented by red on maps.', ['metro','color']),
  fc(C.TRAIN_STATION, D.NORMAL, 'Shinkansen trains run on which gauge?', ['Narrow gauge','Standard gauge','Broad gauge','Mini gauge'], 'b', 'Shinkansen uses standard gauge (1,435mm) unlike conventional JR trains.', ['shinkansen','technical']),
  fc(C.TRAIN_STATION, D.NORMAL, 'Which is NOT a private railway in Tokyo?', ['Keio','Odakyu','Tokyu','JR East'], 'd', 'JR East is a major railway but was originally government-owned.', ['operator']),
  tf(C.TRAIN_STATION, D.NORMAL, 'The Tsukuba Express connects Tokyo to Tsukuba in about 45 minutes.', true, 'TX runs from Akihabara to Tsukuba in approximately 45 minutes.', ['tx','route']),
  fc(C.TRAIN_STATION, D.NORMAL, 'Which station has a famous statue of Hachiko?', ['Tokyo','Shinjuku','Shibuya','Ueno'], 'c', 'The Hachiko statue is at Shibuya Station\'s Hachiko exit.', ['shibuya','landmark']),
  fc(C.TRAIN_STATION, D.NORMAL, 'How many JR companies exist after privatization?', ['3','5','6','7'], 'd', 'There are 7 JR companies: Hokkaido, East, Central, West, Shikoku, Kyushu, and Freight.', ['jr']),
  fc(C.TRAIN_STATION, D.NORMAL, 'Which Shinkansen line goes to Hokkaido?', ['Tokaido','Tohoku/Hokkaido','Hokuriku','Sanyo'], 'b', 'The Hokkaido Shinkansen extends from the Tohoku line via the Seikan Tunnel.', ['shinkansen']),
  tf(C.TRAIN_STATION, D.NORMAL, 'Japan Rail Pass can be used on the Nozomi Shinkansen.', false, 'The Japan Rail Pass cannot be used on Nozomi or Mizuho services.', ['jr_pass']),
  fc(C.TRAIN_STATION, D.NORMAL, 'Which station connects to Narita Airport via Narita Express?', ['Shibuya','Shinjuku','Tokyo','Shinagawa'], 'c', 'The Narita Express (N\'EX) departs from Tokyo Station.', ['airport','access']),
  fb(C.TRAIN_STATION, D.NORMAL, 'The Toei subway system has ___ lines.', '4', ['4','four'], 'Toei operates 4 lines: Asakusa, Mita, Shinjuku, and Oedo.', ['toei']),
  fc(C.TRAIN_STATION, D.NORMAL, 'What is "ekiben"?', ['A type of train','A station lunch box','A ticket type','A rail pass'], 'b', 'Ekiben are bento boxes sold at train stations, a Japanese tradition.', ['culture']),
  // Hard (10)
  fc(C.TRAIN_STATION, D.HARD, 'In what year did the Tokaido Shinkansen begin service?', ['1954','1960','1964','1970'], 'c', 'The Tokaido Shinkansen opened on Oct 1, 1964, just before the Tokyo Olympics.', ['shinkansen','history']),
  fc(C.TRAIN_STATION, D.HARD, 'What is the longest Shinkansen line by distance?', ['Tokaido','Tohoku','Sanyo','Hokuriku'], 'b', 'The Tohoku Shinkansen (Tokyo to Shin-Hakodate-Hokuto) is the longest.', ['shinkansen']),
  tf(C.TRAIN_STATION, D.HARD, 'The Seikan Tunnel connecting Honshu and Hokkaido is the world\'s longest undersea tunnel.', true, 'The Seikan Tunnel\'s undersea section (23.3 km) is the world\'s longest.', ['tunnel']),
  fc(C.TRAIN_STATION, D.HARD, 'What is the maximum speed of the E5 Series Shinkansen?', ['240 km/h','275 km/h','320 km/h','360 km/h'], 'c', 'The E5 Series runs at up to 320 km/h on the Tohoku Shinkansen.', ['shinkansen','speed']),
  fb(C.TRAIN_STATION, D.HARD, 'The world\'s first high-speed rail was the ___ Shinkansen.', 'Tokaido', ['Tokaido','tokaido'], 'The Tokaido Shinkansen (1964) pioneered high-speed rail worldwide.', ['shinkansen','history']),
  fc(C.TRAIN_STATION, D.HARD, 'Which station has the most platforms in Japan?', ['Shinjuku','Tokyo','Nagoya','Osaka'], 'a', 'Shinjuku Station has over 50 platforms serving multiple lines.', ['station','record']),
  tf(C.TRAIN_STATION, D.HARD, 'The Oedo Line is the deepest subway line in Tokyo.', true, 'The Toei Oedo Line runs at depths of over 40 meters in places.', ['toei','oedo']),
  fc(C.TRAIN_STATION, D.HARD, 'How many passengers use Tokyo\'s rail system daily?', ['5 million','10 million','20 million','40 million'], 'd', 'Tokyo\'s rail network carries approximately 40 million passengers daily.', ['statistics']),
  fc(C.TRAIN_STATION, D.HARD, 'What gauge do conventional JR trains use?', ['Standard (1435mm)','Narrow (1067mm)','Broad (1676mm)','Mini (762mm)'], 'b', 'Conventional JR trains use narrow gauge (1,067mm), called Cape gauge.', ['technical']),
  tf(C.TRAIN_STATION, D.HARD, 'The first Japanese railway opened between Shimbashi and Yokohama in 1872.', true, 'Japan\'s first railway opened on October 14, 1872.', ['history']),

  // ========================================================================
  // GENERAL KNOWLEDGE (45 questions)
  // ========================================================================
  // Easy (15)
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'How many continents are there?', ['5','6','7','8'], 'c', 'There are 7 continents on Earth.', ['geography','basic']),
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'What planet is known as the Red Planet?', ['Venus','Mars','Jupiter','Saturn'], 'b', 'Mars appears red due to iron oxide on its surface.', ['space']),
  tf(C.GENERAL_KNOWLEDGE, D.EASY, 'Water boils at 100°C at sea level.', true, 'Water boils at 100°C (212°F) at standard atmospheric pressure.', ['science']),
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'What is the chemical symbol for water?', ['H2O','CO2','O2','NaCl'], 'a', 'Water is composed of two hydrogen atoms and one oxygen atom.', ['chemistry']),
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'Which animal is the largest on Earth?', ['Elephant','Giraffe','Blue Whale','Great White Shark'], 'c', 'The blue whale can grow up to 30 meters long.', ['animal']),
  tf(C.GENERAL_KNOWLEDGE, D.EASY, 'The Sun is a star.', true, 'The Sun is a medium-sized star at the center of our solar system.', ['space']),
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'How many hours are in a day?', ['12','20','24','36'], 'c', 'A full day consists of 24 hours.', ['time','basic']),
  fb(C.GENERAL_KNOWLEDGE, D.EASY, 'The largest ocean on Earth is the ___ Ocean.', 'Pacific', ['Pacific','pacific'], 'The Pacific Ocean covers about one-third of Earth\'s surface.', ['ocean']),
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'What gas do plants absorb from the air?', ['Oxygen','Nitrogen','Carbon dioxide','Helium'], 'c', 'Plants absorb CO2 for photosynthesis and release oxygen.', ['biology']),
  tf(C.GENERAL_KNOWLEDGE, D.EASY, 'Diamonds are made of carbon.', true, 'Diamonds are crystalline forms of pure carbon.', ['chemistry']),
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'Who invented the telephone?', ['Edison','Bell','Tesla','Morse'], 'b', 'Alexander Graham Bell patented the telephone in 1876.', ['invention']),
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'What is the main language spoken in Brazil?', ['Spanish','English','Portuguese','French'], 'c', 'Portuguese is the official language of Brazil.', ['language']),
  fc(C.GENERAL_KNOWLEDGE, D.EASY, 'How many legs does a spider have?', ['6','8','10','12'], 'b', 'Spiders are arachnids and have 8 legs.', ['animal']),
  tf(C.GENERAL_KNOWLEDGE, D.EASY, 'The Great Wall of China is visible from space.', false, 'This is a common myth. The Great Wall is not visible from space with the naked eye.', ['myth']),
  fb(C.GENERAL_KNOWLEDGE, D.EASY, 'The chemical symbol for gold is ___.', 'Au', ['Au','au'], '"Au" comes from the Latin word "aurum".', ['chemistry']),
  // Normal (15)
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'What is the speed of light approximately?', ['100,000 km/s','300,000 km/s','500,000 km/s','1,000,000 km/s'], 'b', 'Light travels at approximately 299,792 km/s.', ['physics']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'Which vitamin is produced by sunlight on skin?', ['Vitamin A','Vitamin C','Vitamin D','Vitamin K'], 'c', 'UV-B radiation enables vitamin D synthesis in the skin.', ['health']),
  tf(C.GENERAL_KNOWLEDGE, D.NORMAL, 'Humans share about 98% of their DNA with chimpanzees.', true, 'Humans and chimps share approximately 98.7% of their DNA.', ['biology']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'What is the most spoken language in the world by native speakers?', ['English','Spanish','Mandarin Chinese','Hindi'], 'c', 'Mandarin Chinese has the most native speakers worldwide.', ['language']),
  fb(C.GENERAL_KNOWLEDGE, D.NORMAL, 'The smallest country in the world is ___.', 'Vatican City', ['Vatican City','Vatican','vatican city'], 'Vatican City covers only 0.44 square kilometers.', ['geography']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'What element has the atomic number 1?', ['Helium','Carbon','Oxygen','Hydrogen'], 'd', 'Hydrogen is the lightest element with atomic number 1.', ['chemistry']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'Which planet has the most moons?', ['Jupiter','Saturn','Uranus','Neptune'], 'b', 'Saturn has the most known moons, over 140.', ['space']),
  tf(C.GENERAL_KNOWLEDGE, D.NORMAL, 'Antibiotics are effective against viruses.', false, 'Antibiotics only work against bacterial infections, not viruses.', ['health']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'What year did World War II end?', ['1943','1944','1945','1946'], 'c', 'WWII ended in 1945 with Japan\'s surrender.', ['history']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'What is the hardest natural substance?', ['Gold','Iron','Diamond','Titanium'], 'c', 'Diamond is the hardest known natural material.', ['science']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'Which country has the most time zones?', ['USA','Russia','China','France'], 'd', 'France has 12 time zones due to its overseas territories.', ['geography']),
  tf(C.GENERAL_KNOWLEDGE, D.NORMAL, 'Sound travels faster in water than in air.', true, 'Sound travels about 4x faster in water (~1,500 m/s) than in air (~343 m/s).', ['physics']),
  fb(C.GENERAL_KNOWLEDGE, D.NORMAL, 'The currency of Japan is the ___.', 'yen', ['yen','Yen','JPY'], 'The Japanese yen (¥) has been the currency since 1871.', ['currency']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'What does DNA stand for?', ['Deoxyribonucleic acid','Dinitrogen acid','Dynamic nuclear assembly','None of these'], 'a', 'DNA = Deoxyribonucleic acid, the molecule carrying genetic information.', ['biology']),
  fc(C.GENERAL_KNOWLEDGE, D.NORMAL, 'Which organ is the largest in the human body?', ['Liver','Brain','Skin','Lung'], 'c', 'The skin is the largest organ, covering about 2 square meters.', ['biology']),
  // Hard (15)
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'What is the Chandrasekhar limit?', ['Speed of light','Max mass of white dwarf','Earth\'s core temp','Dark matter density'], 'b', 'The Chandrasekhar limit (~1.4 solar masses) is the max mass for a white dwarf.', ['physics']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'Which element has the highest melting point?', ['Iron','Tungsten','Carbon','Titanium'], 'b', 'Tungsten has the highest melting point of any pure element (3,422°C).', ['chemistry']),
  tf(C.GENERAL_KNOWLEDGE, D.HARD, 'A light-year is a unit of time.', false, 'A light-year is a unit of distance—the distance light travels in one year.', ['space']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'What is the Fibonacci sequence?', ['Primes only','Each number is sum of previous two','Powers of 2','Random numbers'], 'b', 'Fibonacci: 0, 1, 1, 2, 3, 5, 8, 13, 21... each number is the sum of the two before.', ['math']),
  fb(C.GENERAL_KNOWLEDGE, D.HARD, 'Schrödinger\'s famous thought experiment involves a ___.', 'cat', ['cat'], 'Schrödinger\'s cat illustrates quantum superposition.', ['physics']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'What is the half-life of Carbon-14?', ['100 years','1,000 years','5,730 years','50,000 years'], 'c', 'C-14 has a half-life of 5,730 years, used in radiocarbon dating.', ['chemistry']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'Which mathematical constant equals approximately 2.718?', ['Pi','Phi','Euler\'s number','Square root of 2'], 'c', 'Euler\'s number (e) ≈ 2.71828, the base of natural logarithms.', ['math']),
  tf(C.GENERAL_KNOWLEDGE, D.HARD, 'Pluto is classified as a dwarf planet since 2006.', true, 'The IAU reclassified Pluto as a dwarf planet in August 2006.', ['space']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'What is the most abundant gas in Earth\'s atmosphere?', ['Oxygen','Carbon dioxide','Nitrogen','Argon'], 'c', 'Nitrogen makes up about 78% of Earth\'s atmosphere.', ['science']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'Who formulated the theory of general relativity?', ['Newton','Bohr','Einstein','Hawking'], 'c', 'Albert Einstein published general relativity in 1915.', ['physics']),
  tf(C.GENERAL_KNOWLEDGE, D.HARD, 'The human body contains more bacterial cells than human cells.', true, 'Recent estimates suggest the ratio is roughly 1:1, but bacterial cells slightly outnumber.', ['biology']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'What is the Mpemba effect?', ['Hot water freezes faster than cold','Cold water boils faster','Ice melts slower in salt','None'], 'a', 'The Mpemba effect is the observation that hot water can freeze faster than cold water.', ['physics']),
  fb(C.GENERAL_KNOWLEDGE, D.HARD, 'The phenomenon where light bends around massive objects is called gravitational ___.', 'lensing', ['lensing'], 'Gravitational lensing was predicted by Einstein\'s general relativity.', ['physics']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'What is the approximate age of the universe?', ['4.5 billion years','8 billion years','13.8 billion years','20 billion years'], 'c', 'The universe is approximately 13.8 billion years old.', ['space']),
  fc(C.GENERAL_KNOWLEDGE, D.HARD, 'Which number system uses base 16?', ['Binary','Octal','Decimal','Hexadecimal'], 'd', 'Hexadecimal uses digits 0-9 and letters A-F.', ['computer_science']),

  // ========================================================================
  // JAPANESE CULTURE (40 questions)
  // ========================================================================
  // Easy (15)
  fc(C.JAPANESE_CULTURE, D.EASY, 'What is the traditional Japanese robe called?', ['Hanbok','Kimono','Cheongsam','Sari'], 'b', 'Kimono means "thing to wear" in Japanese.', ['clothing']),
  fc(C.JAPANESE_CULTURE, D.EASY, 'What is "hanami"?', ['Tea ceremony','Flower viewing','Sumo wrestling','Calligraphy'], 'a', 'Hanami (花見) is the tradition of enjoying cherry blossoms.', ['tradition']),
  tf(C.JAPANESE_CULTURE, D.EASY, 'Sushi originated in Japan.', false, 'Sushi originated in Southeast Asia as a way to preserve fish in rice.', ['food','history']),
  fc(C.JAPANESE_CULTURE, D.EASY, 'What is Japan\'s national flower?', ['Rose','Cherry blossom','Chrysanthemum','Lily'], 'b', 'The cherry blossom (sakura) is considered Japan\'s national flower.', ['nature']),
  fc(C.JAPANESE_CULTURE, D.EASY, 'On which date is Japanese New Year celebrated?', ['Feb 1','Jan 1','Dec 25','Mar 1'], 'b', 'Japanese New Year (Shogatsu) is celebrated on January 1st.', ['holiday']),
  tf(C.JAPANESE_CULTURE, D.EASY, 'Bowing is a common greeting in Japan.', true, 'Bowing (ojigi) is the standard greeting, showing respect.', ['etiquette']),
  fb(C.JAPANESE_CULTURE, D.EASY, 'Japan\'s highest mountain is Mount ___.', 'Fuji', ['Fuji','fuji'], 'Mt. Fuji stands at 3,776 meters and is a UNESCO World Heritage Site.', ['geography']),
  fc(C.JAPANESE_CULTURE, D.EASY, 'What are "chopsticks" called in Japanese?', ['Hashi','Saji','Naifu','Foku'], 'a', 'Chopsticks are called "hashi" (箸) in Japanese.', ['food','utensil']),
  fc(C.JAPANESE_CULTURE, D.EASY, 'What is "origami"?', ['Paper folding','Flower arranging','Sword fighting','Tea ceremony'], 'a', 'Origami (折り紙) is the art of folding paper.', ['art']),
  tf(C.JAPANESE_CULTURE, D.EASY, 'Japan has 47 prefectures.', true, 'Japan is divided into 47 prefectures including Tokyo.', ['geography']),
  fc(C.JAPANESE_CULTURE, D.EASY, 'What is "matcha"?', ['Black tea','Green tea powder','Coffee','Rice wine'], 'b', 'Matcha is finely ground green tea used in tea ceremonies.', ['food','tea']),
  fc(C.JAPANESE_CULTURE, D.EASY, 'What is the Japanese word for "thank you"?', ['Sumimasen','Arigatou','Konnichiwa','Sayounara'], 'b', 'Arigatou (ありがとう) means "thank you".', ['language']),
  fc(C.JAPANESE_CULTURE, D.EASY, 'Which city was Japan\'s capital before Tokyo?', ['Osaka','Nara','Kyoto','Kamakura'], 'c', 'Kyoto was the imperial capital for over 1,000 years until 1868.', ['history']),
  tf(C.JAPANESE_CULTURE, D.EASY, 'Sumo is Japan\'s national sport.', true, 'Sumo wrestling is considered Japan\'s national sport.', ['sport']),
  fb(C.JAPANESE_CULTURE, D.EASY, 'The Japanese writing system uses three scripts: hiragana, katakana, and ___.', 'kanji', ['kanji','Kanji'], 'Kanji are Chinese characters used in Japanese writing.', ['language']),
  // Normal (15)
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'What is "osechi-ryori"?', ['Summer festival food','New Year dishes','Wedding food','Funeral meal'], 'b', 'Osechi-ryori are traditional foods eaten during New Year.', ['food','holiday']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'What does "wabi-sabi" represent?', ['Perfection','Beauty in imperfection','Wealth','Speed'], 'b', 'Wabi-sabi embraces the beauty of imperfection and transience.', ['philosophy']),
  tf(C.JAPANESE_CULTURE, D.NORMAL, 'Golden Week includes at least 4 national holidays.', true, 'Golden Week spans Showa Day, Constitution Day, Greenery Day, and Children\'s Day.', ['holiday']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'What is "ikebana"?', ['Martial art','Flower arranging','Pottery','Painting'], 'b', 'Ikebana (生け花) is the Japanese art of flower arrangement.', ['art']),
  fb(C.JAPANESE_CULTURE, D.NORMAL, 'The festival for children aged 3, 5, and 7 is called ___.', 'Shichi-Go-San', ['Shichi-Go-San','shichi-go-san','七五三'], 'Shichi-Go-San (七五三) celebrates children\'s growth and well-being.', ['festival']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'Which prefecture is famous for its deer park?', ['Osaka','Kyoto','Nara','Hiroshima'], 'c', 'Nara Park has over 1,000 wild deer roaming freely.', ['prefecture']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'What is "torii"?', ['A gate','A temple','A shrine priest','A bell'], 'a', 'Torii (鳥居) are the iconic gates at Shinto shrines.', ['shrine']),
  tf(C.JAPANESE_CULTURE, D.NORMAL, 'Hokkaido is the largest prefecture in Japan by area.', true, 'Hokkaido covers about 83,424 km², the largest by far.', ['geography']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'What is "onsen"?', ['A type of food','Hot spring bath','A festival','A garden'], 'b', 'Onsen (温泉) are natural hot spring baths enjoyed throughout Japan.', ['tradition']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'In which month is Obon typically celebrated?', ['March','May','August','December'], 'c', 'Obon is usually observed around August 13-16.', ['festival']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'What is "furoshiki"?', ['A wrapping cloth','A type of sushi','A dance','A martial art'], 'a', 'Furoshiki is a traditional wrapping cloth used to carry items.', ['tradition']),
  tf(C.JAPANESE_CULTURE, D.NORMAL, 'The Japanese school year starts in April.', true, 'The school year begins in April, coinciding with cherry blossom season.', ['education']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'What is "omiyage"?', ['A greeting','Souvenir gifts','A prayer','A dance'], 'b', 'Omiyage are souvenir gifts brought back from trips for friends and family.', ['tradition']),
  fb(C.JAPANESE_CULTURE, D.NORMAL, 'The art of Japanese calligraphy is called ___.', 'shodo', ['shodo','shodou','書道','Shodo'], 'Shodo (書道) means "the way of writing".', ['art']),
  fc(C.JAPANESE_CULTURE, D.NORMAL, 'Which is NOT a type of Japanese pottery?', ['Arita','Kutani','Bizen','Ukiyo'], 'd', 'Ukiyo-e is a style of woodblock printing, not pottery.', ['art']),
  // Hard (10)
  fc(C.JAPANESE_CULTURE, D.HARD, 'What is "kintsugi"?', ['Sword making','Repairing pottery with gold','Paper craft','Silk weaving'], 'b', 'Kintsugi repairs broken pottery with gold, embracing imperfection.', ['art','philosophy']),
  fc(C.JAPANESE_CULTURE, D.HARD, 'How many UNESCO World Heritage Sites does Japan have (approx)?', ['10','15','25','35'], 'c', 'Japan has approximately 25 UNESCO World Heritage Sites.', ['heritage']),
  tf(C.JAPANESE_CULTURE, D.HARD, 'The Meiji Restoration occurred in 1868.', true, 'The Meiji Restoration of 1868 ended the shogunate and restored imperial rule.', ['history']),
  fc(C.JAPANESE_CULTURE, D.HARD, 'What is "mono no aware"?', ['A martial art','Awareness of impermanence','A cooking style','A religion'], 'b', 'Mono no aware describes the bittersweet awareness of transience.', ['philosophy']),
  fb(C.JAPANESE_CULTURE, D.HARD, 'The Japanese concept of continuous improvement is called ___.', 'kaizen', ['kaizen','Kaizen'], 'Kaizen (改善) means "change for the better" and is used in business.', ['business']),
  fc(C.JAPANESE_CULTURE, D.HARD, 'Which emperor era name means "beautiful harmony"?', ['Showa','Heisei','Reiwa','Taisho'], 'c', 'Reiwa (令和), starting 2019, means "beautiful harmony".', ['era']),
  fc(C.JAPANESE_CULTURE, D.HARD, 'What is "bushido"?', ['A weapon','The way of the warrior','A festival','A temple'], 'b', 'Bushido (武士道) is the samurai code of honor and ethics.', ['history']),
  tf(C.JAPANESE_CULTURE, D.HARD, 'Noh theater predates Kabuki theater.', true, 'Noh developed in the 14th century; Kabuki emerged in the early 17th century.', ['theater']),
  fc(C.JAPANESE_CULTURE, D.HARD, 'Which castle is known as "White Heron Castle"?', ['Osaka Castle','Nagoya Castle','Himeji Castle','Matsumoto Castle'], 'c', 'Himeji Castle is called Shirasagi-jo (White Heron Castle) for its white exterior.', ['castle']),
  fc(C.JAPANESE_CULTURE, D.HARD, 'What is "zangyou" in Japanese work culture?', ['Vacation','Overtime work','Promotion','Retirement'], 'b', 'Zangyou (残業) means overtime work, a significant topic in Japanese labor.', ['business']),

  // ========================================================================
  // GEOGRAPHY (40 questions)
  // ========================================================================
  // Easy (15)
  fc(C.GEOGRAPHY, D.EASY, 'What is the capital of France?', ['London','Berlin','Madrid','Paris'], 'd', 'Paris is the capital and largest city of France.', ['capital','europe']),
  fc(C.GEOGRAPHY, D.EASY, 'Which is the longest river in the world?', ['Amazon','Nile','Mississippi','Yangtze'], 'b', 'The Nile is approximately 6,650 km long.', ['river']),
  tf(C.GEOGRAPHY, D.EASY, 'Australia is both a country and a continent.', true, 'Australia is the world\'s smallest continent and largest island country.', ['continent']),
  fc(C.GEOGRAPHY, D.EASY, 'Which ocean is between America and Europe?', ['Pacific','Indian','Atlantic','Arctic'], 'c', 'The Atlantic Ocean separates the Americas from Europe and Africa.', ['ocean']),
  fb(C.GEOGRAPHY, D.EASY, 'The capital of the United States is ___.', 'Washington, D.C.', ['Washington, D.C.','Washington DC','Washington','washington'], 'Washington, D.C. has been the U.S. capital since 1790.', ['capital','america']),
  fc(C.GEOGRAPHY, D.EASY, 'Which country has the largest population?', ['USA','India','China','Russia'], 'b', 'India surpassed China as the most populous country in 2023.', ['population']),
  fc(C.GEOGRAPHY, D.EASY, 'What is the largest desert in the world?', ['Sahara','Gobi','Antarctic','Arabian'], 'c', 'Antarctica is the largest desert by area (cold desert).', ['desert']),
  tf(C.GEOGRAPHY, D.EASY, 'Mount Everest is the tallest mountain on Earth.', true, 'Mount Everest stands at 8,849 meters, the highest point on Earth.', ['mountain']),
  fc(C.GEOGRAPHY, D.EASY, 'Which continent is the largest?', ['Africa','Europe','Asia','North America'], 'c', 'Asia is the largest continent by both area and population.', ['continent']),
  fc(C.GEOGRAPHY, D.EASY, 'What country is known as the Land of the Rising Sun?', ['China','Korea','Japan','Thailand'], 'c', 'Japan is called the Land of the Rising Sun (Nihon/Nippon = sun origin).', ['country']),
  fb(C.GEOGRAPHY, D.EASY, 'The capital of Japan is ___.', 'Tokyo', ['Tokyo','tokyo'], 'Tokyo has been Japan\'s capital since 1868.', ['capital','asia']),
  fc(C.GEOGRAPHY, D.EASY, 'Which is the smallest continent?', ['Europe','Australia','Antarctica','South America'], 'b', 'Australia/Oceania is the smallest continent.', ['continent']),
  tf(C.GEOGRAPHY, D.EASY, 'Russia is the largest country by area.', true, 'Russia spans over 17 million square kilometers.', ['country']),
  fc(C.GEOGRAPHY, D.EASY, 'The Amazon Rainforest is mostly in which country?', ['Colombia','Peru','Brazil','Venezuela'], 'c', 'About 60% of the Amazon Rainforest is in Brazil.', ['forest']),
  fc(C.GEOGRAPHY, D.EASY, 'What is the capital of the UK?', ['Edinburgh','Dublin','London','Manchester'], 'c', 'London is the capital of the United Kingdom.', ['capital','europe']),
  // Normal (15)
  fc(C.GEOGRAPHY, D.NORMAL, 'Which strait separates Europe and Africa?', ['Bosphorus','Gibraltar','Malacca','Hormuz'], 'b', 'The Strait of Gibraltar separates Spain from Morocco.', ['strait']),
  fc(C.GEOGRAPHY, D.NORMAL, 'What is the deepest point in the ocean?', ['Mariana Trench','Tonga Trench','Java Trench','Puerto Rico Trench'], 'a', 'The Challenger Deep in the Mariana Trench reaches ~11,034 m.', ['ocean']),
  tf(C.GEOGRAPHY, D.NORMAL, 'Iceland is covered mostly by ice.', false, 'Despite its name, only about 11% of Iceland is covered by glaciers.', ['country','myth']),
  fc(C.GEOGRAPHY, D.NORMAL, 'Which African country has the most people?', ['South Africa','Egypt','Nigeria','Ethiopia'], 'c', 'Nigeria has the largest population in Africa (~220 million).', ['population','africa']),
  fb(C.GEOGRAPHY, D.NORMAL, 'The longest wall in the world is the Great Wall of ___.', 'China', ['China','china'], 'The Great Wall stretches over 21,000 km.', ['landmark']),
  fc(C.GEOGRAPHY, D.NORMAL, 'Which country has the most islands?', ['Indonesia','Philippines','Japan','Sweden'], 'd', 'Sweden has approximately 267,570 islands.', ['island']),
  fc(C.GEOGRAPHY, D.NORMAL, 'Lake Baikal, the deepest lake, is in which country?', ['Canada','China','Russia','Kazakhstan'], 'c', 'Lake Baikal in Siberia is the world\'s deepest lake (1,642 m).', ['lake']),
  tf(C.GEOGRAPHY, D.NORMAL, 'The Sahara Desert is in South America.', false, 'The Sahara Desert is in northern Africa.', ['desert']),
  fc(C.GEOGRAPHY, D.NORMAL, 'What is the capital of Australia?', ['Sydney','Melbourne','Canberra','Brisbane'], 'c', 'Canberra is the capital, not Sydney or Melbourne.', ['capital','oceania']),
  fc(C.GEOGRAPHY, D.NORMAL, 'Which river runs through London?', ['Seine','Rhine','Thames','Danube'], 'c', 'The River Thames flows through London.', ['river','europe']),
  fc(C.GEOGRAPHY, D.NORMAL, 'Which mountain range separates Europe from Asia?', ['Alps','Himalayas','Ural','Andes'], 'c', 'The Ural Mountains form the boundary between Europe and Asia.', ['mountain']),
  tf(C.GEOGRAPHY, D.NORMAL, 'Canada has the longest coastline of any country.', true, 'Canada\'s coastline spans approximately 202,080 km.', ['country']),
  fc(C.GEOGRAPHY, D.NORMAL, 'Which city is on two continents?', ['Cairo','Moscow','Istanbul','Dubai'], 'c', 'Istanbul straddles Europe and Asia across the Bosphorus.', ['city']),
  fb(C.GEOGRAPHY, D.NORMAL, 'The longest mountain range on Earth is the ___.', 'Andes', ['Andes','andes'], 'The Andes stretch over 7,000 km through South America.', ['mountain']),
  fc(C.GEOGRAPHY, D.NORMAL, 'Which country is both in Europe and Asia?', ['Greece','Turkey','Egypt','Iran'], 'b', 'Turkey spans both Europe (Thrace) and Asia (Anatolia).', ['country']),
  // Hard (10)
  fc(C.GEOGRAPHY, D.HARD, 'What is the driest place on Earth?', ['Sahara Desert','Atacama Desert','McMurdo Dry Valleys','Death Valley'], 'c', 'McMurdo Dry Valleys in Antarctica have had no rain for ~2 million years.', ['extreme']),
  fc(C.GEOGRAPHY, D.HARD, 'Which country has the most time zones?', ['Russia','USA','France','Australia'], 'c', 'France has 12 time zones including overseas territories.', ['time_zone']),
  tf(C.GEOGRAPHY, D.HARD, 'The Dead Sea is actually a lake.', true, 'The Dead Sea is a salt lake bordered by Jordan and Israel.', ['lake']),
  fc(C.GEOGRAPHY, D.HARD, 'What is the only country that borders both the Atlantic and Indian Oceans?', ['Brazil','India','South Africa','Australia'], 'c', 'South Africa is at the southern tip of Africa between both oceans.', ['country']),
  fb(C.GEOGRAPHY, D.HARD, 'The deepest lake in Africa is Lake ___.', 'Tanganyika', ['Tanganyika','tanganyika'], 'Lake Tanganyika reaches 1,470 m depth, the second deepest in the world.', ['lake','africa']),
  fc(C.GEOGRAPHY, D.HARD, 'Which is the most densely populated country?', ['Bangladesh','Monaco','Singapore','India'], 'b', 'Monaco has ~26,000 people per km², the highest density.', ['population']),
  fc(C.GEOGRAPHY, D.HARD, 'The Ring of Fire is located around which ocean?', ['Atlantic','Indian','Pacific','Arctic'], 'c', 'The Ring of Fire surrounds the Pacific Ocean with 75% of world\'s volcanoes.', ['geology']),
  tf(C.GEOGRAPHY, D.HARD, 'Africa has more countries than any other continent.', true, 'Africa has 54 recognized countries, the most of any continent.', ['continent']),
  fc(C.GEOGRAPHY, D.HARD, 'Which strait is the narrowest in the world?', ['Messina','Dover','Malacca','Tsugaru'], 'a', 'The Strait of Messina between Sicily and Italy is about 3.1 km at its narrowest.', ['strait']),
  fc(C.GEOGRAPHY, D.HARD, 'What percentage of Earth\'s water is freshwater?', ['3%','10%','25%','50%'], 'a', 'Only about 3% of Earth\'s water is freshwater, and most is in ice caps.', ['water']),

  // ========================================================================
  // FOOD & DRINK (40 questions)
  // ========================================================================
  // Easy (15)
  fc(C.FOOD_DRINK, D.EASY, 'What is sushi typically made with?', ['Bread','Rice','Noodles','Corn'], 'b', 'Sushi is made with vinegared rice, often topped with fish.', ['japanese','basic']),
  fc(C.FOOD_DRINK, D.EASY, 'Where does pizza originate from?', ['France','USA','Italy','Spain'], 'c', 'Modern pizza originated in Naples, Italy.', ['italian','origin']),
  tf(C.FOOD_DRINK, D.EASY, 'Wasabi is a type of Japanese horseradish.', true, 'Real wasabi comes from the wasabi plant, a member of the horseradish family.', ['japanese','condiment']),
  fc(C.FOOD_DRINK, D.EASY, 'What is "ramen"?', ['A rice dish','A noodle soup','A type of sushi','A dessert'], 'b', 'Ramen is a Japanese noodle soup with various broth types.', ['japanese','noodle']),
  fb(C.FOOD_DRINK, D.EASY, 'Japanese rice wine is called ___.', 'sake', ['sake','Sake','nihonshu'], 'Sake (日本酒) is brewed from polished rice.', ['japanese','drink']),
  fc(C.FOOD_DRINK, D.EASY, 'Which fruit is Japan famous for being expensive?', ['Apple','Banana','Melon','Orange'], 'c', 'Japanese melons (like Yubari) can sell for thousands of dollars.', ['japanese','fruit']),
  tf(C.FOOD_DRINK, D.EASY, 'Tofu is made from soybeans.', true, 'Tofu is made by coagulating soy milk and pressing the curds.', ['japanese','ingredient']),
  fc(C.FOOD_DRINK, D.EASY, 'What is "miso"?', ['A type of fish','Fermented soybean paste','A vegetable','A fruit'], 'b', 'Miso is fermented soybean paste used in soups and seasonings.', ['japanese','condiment']),
  fc(C.FOOD_DRINK, D.EASY, 'Which is a popular Japanese snack?', ['Croissant','Onigiri','Taco','Pretzel'], 'b', 'Onigiri (rice balls) are a staple Japanese snack.', ['japanese','snack']),
  fc(C.FOOD_DRINK, D.EASY, 'What drink is made from cacao beans?', ['Coffee','Tea','Chocolate','Juice'], 'c', 'Chocolate is made from processed cacao beans.', ['drink','ingredient']),
  tf(C.FOOD_DRINK, D.EASY, 'Tempura is a Japanese fried dish.', true, 'Tempura consists of battered and deep-fried vegetables or seafood.', ['japanese']),
  fc(C.FOOD_DRINK, D.EASY, 'What is "edamame"?', ['A fish','Young soybeans','A mushroom','A rice dish'], 'b', 'Edamame are young, green soybeans, often served as a snack.', ['japanese','vegetable']),
  fb(C.FOOD_DRINK, D.EASY, 'The Japanese word for "delicious" is ___.', 'oishii', ['oishii','Oishii','おいしい'], 'Oishii (おいしい/美味しい) means delicious in Japanese.', ['japanese','language']),
  fc(C.FOOD_DRINK, D.EASY, 'Which country is famous for croissants?', ['Germany','France','Italy','Spain'], 'b', 'Croissants are iconic French pastries.', ['french','pastry']),
  fc(C.FOOD_DRINK, D.EASY, 'What type of food is "udon"?', ['Rice','Thick noodles','Thin noodles','Bread'], 'b', 'Udon are thick, chewy Japanese wheat noodles.', ['japanese','noodle']),
  // Normal (15)
  fc(C.FOOD_DRINK, D.NORMAL, 'What is "dashi"?', ['A knife','Japanese cooking stock','A rice cooker','A spice'], 'b', 'Dashi is a fundamental Japanese cooking stock made from kombu and bonito.', ['japanese','cooking']),
  fc(C.FOOD_DRINK, D.NORMAL, 'Soy sauce originated in which country?', ['Japan','Korea','China','Thailand'], 'c', 'Soy sauce originated in China over 2,000 years ago.', ['condiment','origin']),
  tf(C.FOOD_DRINK, D.NORMAL, 'Wagyu beef comes from any cow raised in Japan.', false, 'Wagyu refers to specific Japanese cattle breeds known for marbling.', ['japanese','meat']),
  fc(C.FOOD_DRINK, D.NORMAL, 'What type of seaweed is used to wrap sushi rolls?', ['Wakame','Kombu','Nori','Hijiki'], 'c', 'Nori is the dried seaweed sheet used for maki rolls.', ['japanese','ingredient']),
  fb(C.FOOD_DRINK, D.NORMAL, 'The Japanese art of making sweets is called ___.', 'wagashi', ['wagashi','Wagashi','和菓子'], 'Wagashi are traditional Japanese confections often served with tea.', ['japanese','dessert']),
  fc(C.FOOD_DRINK, D.NORMAL, 'Which spice gives curry its yellow color?', ['Paprika','Cumin','Turmeric','Coriander'], 'c', 'Turmeric contains curcumin, which gives curry its yellow color.', ['spice']),
  fc(C.FOOD_DRINK, D.NORMAL, 'What is "umami"?', ['Sweet taste','Sour taste','Savory taste','Bitter taste'], 'c', 'Umami is the fifth basic taste, often described as savory.', ['taste']),
  tf(C.FOOD_DRINK, D.NORMAL, 'Coffee beans are actually seeds of a fruit.', true, 'Coffee "beans" are seeds inside the cherry-like fruit of the coffee plant.', ['drink','trivia']),
  fc(C.FOOD_DRINK, D.NORMAL, 'What is "takoyaki"?', ['Fried chicken','Octopus balls','Fish cake','Rice crackers'], 'b', 'Takoyaki are round snacks filled with diced octopus, a specialty of Osaka.', ['japanese','street_food']),
  fc(C.FOOD_DRINK, D.NORMAL, 'Which region of Japan is famous for tonkotsu ramen?', ['Hokkaido','Tokyo','Kyushu','Okinawa'], 'c', 'Kyushu, especially Fukuoka, is the birthplace of tonkotsu (pork bone) ramen.', ['japanese','ramen']),
  fc(C.FOOD_DRINK, D.NORMAL, 'What is "kombucha" in Japanese?', ['Fermented tea drink','Seaweed tea','Green tea','Black tea'], 'b', 'In Japanese, kombucha (昆布茶) is seaweed tea, not the fermented drink.', ['drink','trivia']),
  tf(C.FOOD_DRINK, D.NORMAL, 'White chocolate contains no cocoa solids.', true, 'White chocolate is made from cocoa butter, sugar, and milk, but no cocoa solids.', ['chocolate']),
  fb(C.FOOD_DRINK, D.NORMAL, 'The Japanese fermented soybean dish is called ___.', 'natto', ['natto','Natto','納豆'], 'Natto is known for its strong smell and sticky texture.', ['japanese','fermented']),
  fc(C.FOOD_DRINK, D.NORMAL, 'Which Japanese dish is grilled eel?', ['Sashimi','Unagi','Gyoza','Tonkatsu'], 'b', 'Unagi (鰻) is freshwater eel, often grilled with sweet sauce.', ['japanese','fish']),
  fc(C.FOOD_DRINK, D.NORMAL, 'What is the main ingredient of guacamole?', ['Tomato','Avocado','Lime','Pepper'], 'b', 'Guacamole is primarily made from mashed avocado.', ['mexican']),
  // Hard (10)
  fc(C.FOOD_DRINK, D.HARD, 'What is "kaiseki"?', ['Street food','Multi-course haute cuisine','A type of sake','Fast food'], 'b', 'Kaiseki is traditional multi-course Japanese haute cuisine.', ['japanese','fine_dining']),
  fc(C.FOOD_DRINK, D.HARD, 'Which Japanese chef knife is used for vegetables?', ['Yanagiba','Deba','Nakiri','Santoku'], 'c', 'Nakiri is a double-beveled knife designed specifically for vegetables.', ['japanese','knife']),
  tf(C.FOOD_DRINK, D.HARD, 'The Maillard reaction is what makes bread brown when toasted.', true, 'The Maillard reaction between amino acids and sugars creates browning and flavor.', ['science']),
  fc(C.FOOD_DRINK, D.HARD, 'What is "koji" used for?', ['Making miso, soy sauce, sake','Making sushi rice','Grilling fish','Boiling noodles'], 'a', 'Koji mold (Aspergillus oryzae) is essential for fermenting many Japanese foods.', ['japanese','fermentation']),
  fb(C.FOOD_DRINK, D.HARD, 'The poisonous pufferfish served as a delicacy in Japan is called ___.', 'fugu', ['fugu','Fugu','ふぐ'], 'Fugu chefs must be specially licensed to prepare this dangerous fish.', ['japanese','fish']),
  fc(C.FOOD_DRINK, D.HARD, 'Which tea requires shading the plants before harvest?', ['Sencha','Hojicha','Gyokuro','Genmaicha'], 'c', 'Gyokuro is shaded for 20+ days, producing a rich, sweet flavor.', ['japanese','tea']),
  fc(C.FOOD_DRINK, D.HARD, 'What gives Japanese curry its thickness?', ['Flour roux','Cornstarch','Potato starch','Gelatin'], 'a', 'Japanese curry uses a flour-based roux, unlike Indian curry.', ['japanese','cooking']),
  tf(C.FOOD_DRINK, D.HARD, 'Kobe beef must come from Hyogo Prefecture.', true, 'Authentic Kobe beef comes only from Tajima cattle raised in Hyogo Prefecture.', ['japanese','meat']),
  fc(C.FOOD_DRINK, D.HARD, 'What is "shojin ryori"?', ['Sumo wrestler diet','Buddhist vegetarian cuisine','Samurai feast','Street food'], 'b', 'Shojin ryori is the vegetarian cuisine of Buddhist monks.', ['japanese','vegetarian']),
  fc(C.FOOD_DRINK, D.HARD, 'Champagne must come from which region?', ['Bordeaux','Burgundy','Champagne','Loire'], 'c', 'Only sparkling wine from the Champagne region of France can be called Champagne.', ['drink','wine']),

  // ========================================================================
  // SCIENCE (40 questions)
  // ========================================================================
  // Easy (15)
  fc(C.SCIENCE, D.EASY, 'What is H2O?', ['Hydrogen gas','Oxygen','Water','Salt'], 'c', 'H2O is the chemical formula for water.', ['chemistry']),
  fc(C.SCIENCE, D.EASY, 'What planet is closest to the Sun?', ['Venus','Earth','Mercury','Mars'], 'c', 'Mercury is the closest planet to the Sun.', ['astronomy']),
  tf(C.SCIENCE, D.EASY, 'The Earth revolves around the Sun.', true, 'Earth orbits the Sun once approximately every 365.25 days.', ['astronomy']),
  fc(C.SCIENCE, D.EASY, 'What gas do we breathe in?', ['Carbon dioxide','Nitrogen','Oxygen','Hydrogen'], 'c', 'We breathe in oxygen for cellular respiration.', ['biology']),
  fb(C.SCIENCE, D.EASY, 'The force that pulls objects toward Earth is called ___.', 'gravity', ['gravity','Gravity'], 'Gravity is the force of attraction between masses.', ['physics']),
  fc(C.SCIENCE, D.EASY, 'How many planets are in our solar system?', ['7','8','9','10'], 'b', 'There are 8 planets since Pluto was reclassified in 2006.', ['astronomy']),
  tf(C.SCIENCE, D.EASY, 'Electrons are larger than protons.', false, 'Electrons are much smaller than protons (about 1/1836 the mass).', ['physics']),
  fc(C.SCIENCE, D.EASY, 'What is the center of an atom called?', ['Electron','Neutron','Nucleus','Proton'], 'c', 'The nucleus contains protons and neutrons at the atom\'s center.', ['chemistry']),
  fc(C.SCIENCE, D.EASY, 'Which sense do your ears provide?', ['Sight','Smell','Hearing','Touch'], 'c', 'Ears are the organs of hearing (auditory sense).', ['biology']),
  fc(C.SCIENCE, D.EASY, 'What does a thermometer measure?', ['Weight','Speed','Temperature','Volume'], 'c', 'A thermometer measures temperature.', ['measurement']),
  tf(C.SCIENCE, D.EASY, 'Light travels faster than sound.', true, 'Light travels at ~300,000 km/s; sound at ~343 m/s in air.', ['physics']),
  fc(C.SCIENCE, D.EASY, 'What is the boiling point of water in Celsius?', ['50°C','75°C','100°C','150°C'], 'c', 'Water boils at 100°C at sea level.', ['chemistry']),
  fb(C.SCIENCE, D.EASY, 'The closest star to Earth is the ___.', 'Sun', ['Sun','sun'], 'The Sun is about 150 million km from Earth.', ['astronomy']),
  fc(C.SCIENCE, D.EASY, 'What are the three states of matter?', ['Hot, warm, cold','Solid, liquid, gas','Big, medium, small','Fast, slow, still'], 'b', 'Matter exists as solid, liquid, or gas (plus plasma).', ['physics']),
  fc(C.SCIENCE, D.EASY, 'What organ pumps blood through your body?', ['Brain','Lungs','Heart','Liver'], 'c', 'The heart pumps blood through the circulatory system.', ['biology']),
  // Normal (15)
  fc(C.SCIENCE, D.NORMAL, 'What is photosynthesis?', ['Plants making food from light','Animal digestion','Rock formation','Water cycle'], 'a', 'Photosynthesis converts CO2 and water into glucose using sunlight.', ['biology']),
  fc(C.SCIENCE, D.NORMAL, 'What is the pH of pure water?', ['5','7','9','14'], 'b', 'Pure water has a neutral pH of 7.', ['chemistry']),
  tf(C.SCIENCE, D.NORMAL, 'DNA has a double helix structure.', true, 'Watson and Crick described DNA\'s double helix in 1953.', ['biology']),
  fc(C.SCIENCE, D.NORMAL, 'Which particle has a negative charge?', ['Proton','Neutron','Electron','Photon'], 'c', 'Electrons carry a negative electrical charge.', ['physics']),
  fb(C.SCIENCE, D.NORMAL, 'Newton\'s first law is also called the law of ___.', 'inertia', ['inertia','Inertia'], 'An object at rest stays at rest unless acted upon by a force.', ['physics']),
  fc(C.SCIENCE, D.NORMAL, 'What causes tides on Earth?', ['Wind','Earth\'s rotation','Moon\'s gravity','Sun\'s heat'], 'c', 'Tides are primarily caused by the gravitational pull of the Moon.', ['astronomy']),
  fc(C.SCIENCE, D.NORMAL, 'What is the powerhouse of the cell?', ['Nucleus','Ribosome','Mitochondria','Cell membrane'], 'c', 'Mitochondria produce ATP, the energy currency of cells.', ['biology']),
  tf(C.SCIENCE, D.NORMAL, 'Sound cannot travel through a vacuum.', true, 'Sound requires a medium (solid, liquid, or gas) to travel.', ['physics']),
  fc(C.SCIENCE, D.NORMAL, 'Which metal is liquid at room temperature?', ['Gold','Silver','Mercury','Lead'], 'c', 'Mercury (Hg) is the only metal that is liquid at room temperature.', ['chemistry']),
  fc(C.SCIENCE, D.NORMAL, 'What type of energy does a moving object have?', ['Potential','Kinetic','Thermal','Nuclear'], 'b', 'Kinetic energy is the energy of motion.', ['physics']),
  fc(C.SCIENCE, D.NORMAL, 'How many chromosomes do humans have?', ['23','44','46','48'], 'c', 'Humans have 46 chromosomes (23 pairs).', ['biology']),
  tf(C.SCIENCE, D.NORMAL, 'Osmosis is the movement of water across a semipermeable membrane.', true, 'Osmosis moves water from low to high solute concentration.', ['biology']),
  fc(C.SCIENCE, D.NORMAL, 'What does E=mc² describe?', ['Speed of light','Mass-energy equivalence','Gravity','Momentum'], 'b', 'Einstein\'s equation shows mass and energy are interchangeable.', ['physics']),
  fb(C.SCIENCE, D.NORMAL, 'The study of living organisms is called ___.', 'biology', ['biology','Biology'], 'Biology comes from Greek: bios (life) + logos (study).', ['science']),
  fc(C.SCIENCE, D.NORMAL, 'Which gas makes up most of the Sun?', ['Oxygen','Carbon','Hydrogen','Helium'], 'c', 'The Sun is about 73% hydrogen and 25% helium.', ['astronomy']),
  // Hard (10)
  fc(C.SCIENCE, D.HARD, 'What is the Heisenberg Uncertainty Principle?', ['Energy is conserved','Position and momentum can\'t both be precisely known','Light is a wave','Atoms are indivisible'], 'b', 'You cannot simultaneously know both the exact position and momentum of a particle.', ['quantum_physics']),
  fc(C.SCIENCE, D.HARD, 'What is CRISPR used for?', ['Space travel','Gene editing','Nuclear energy','Computer chips'], 'b', 'CRISPR-Cas9 is a revolutionary gene-editing technology.', ['genetics']),
  tf(C.SCIENCE, D.HARD, 'Quarks are the smallest known particles.', true, 'Quarks are elementary particles that make up protons and neutrons.', ['particle_physics']),
  fc(C.SCIENCE, D.HARD, 'What is the Doppler effect?', ['Light bending','Frequency change due to motion','Magnetic fields','Nuclear decay'], 'b', 'The Doppler effect is the change in frequency due to relative motion.', ['physics']),
  fb(C.SCIENCE, D.HARD, 'The particle that gives mass to other particles is the ___ boson.', 'Higgs', ['Higgs','higgs'], 'The Higgs boson was confirmed at CERN in 2012.', ['particle_physics']),
  fc(C.SCIENCE, D.HARD, 'What is the most abundant element in the universe?', ['Oxygen','Carbon','Helium','Hydrogen'], 'd', 'Hydrogen makes up about 75% of all normal matter by mass.', ['astronomy']),
  fc(C.SCIENCE, D.HARD, 'What type of bond shares electrons between atoms?', ['Ionic','Covalent','Metallic','Hydrogen'], 'b', 'Covalent bonds form when atoms share electron pairs.', ['chemistry']),
  tf(C.SCIENCE, D.HARD, 'Black holes emit Hawking radiation.', true, 'Stephen Hawking theorized that black holes emit thermal radiation.', ['astrophysics']),
  fc(C.SCIENCE, D.HARD, 'What is the SI unit of electric current?', ['Volt','Watt','Ampere','Ohm'], 'c', 'The ampere (A) is the SI unit of electric current.', ['physics']),
  fc(C.SCIENCE, D.HARD, 'Which organelle is responsible for protein synthesis?', ['Golgi apparatus','Ribosome','Lysosome','Endoplasmic reticulum'], 'b', 'Ribosomes translate mRNA into proteins.', ['biology']),

  // ========================================================================
  // HISTORY (40 questions)
  // ========================================================================
  // Easy (15)
  fc(C.HISTORY, D.EASY, 'Who was the first president of the United States?', ['Lincoln','Jefferson','Washington','Adams'], 'c', 'George Washington served as the first president (1789-1797).', ['american','president']),
  fc(C.HISTORY, D.EASY, 'In which year did World War II end?', ['1943','1944','1945','1946'], 'c', 'WWII ended in 1945 with the surrender of Japan.', ['wwii']),
  tf(C.HISTORY, D.EASY, 'The ancient Egyptians built the pyramids.', true, 'The Great Pyramid of Giza was built around 2560 BC.', ['ancient','egypt']),
  fc(C.HISTORY, D.EASY, 'Who discovered America in 1492?', ['Magellan','Columbus','Drake','Cook'], 'b', 'Christopher Columbus reached the Americas in 1492.', ['exploration']),
  fb(C.HISTORY, D.EASY, 'The city destroyed by a volcano in 79 AD was ___.', 'Pompeii', ['Pompeii','pompeii'], 'Mount Vesuvius buried Pompeii in volcanic ash.', ['ancient','roman']),
  fc(C.HISTORY, D.EASY, 'Which wall divided Berlin?', ['Great Wall','Berlin Wall','Iron Wall','Stone Wall'], 'b', 'The Berlin Wall divided East and West Berlin from 1961 to 1989.', ['cold_war']),
  tf(C.HISTORY, D.EASY, 'Samurai were warriors of medieval Japan.', true, 'Samurai served as military nobility from the 12th-19th centuries.', ['japanese']),
  fc(C.HISTORY, D.EASY, 'Which empire built the Colosseum?', ['Greek','Roman','Persian','Ottoman'], 'b', 'The Colosseum was built by the Roman Empire around 70-80 AD.', ['roman']),
  fc(C.HISTORY, D.EASY, 'Who was known as the "Maid of Orléans"?', ['Cleopatra','Queen Victoria','Joan of Arc','Marie Curie'], 'c', 'Joan of Arc led French forces during the Hundred Years\' War.', ['french','medieval']),
  fc(C.HISTORY, D.EASY, 'What ancient civilization built Machu Picchu?', ['Maya','Aztec','Inca','Olmec'], 'c', 'The Inca built Machu Picchu in the 15th century.', ['inca','ancient']),
  tf(C.HISTORY, D.EASY, 'The Renaissance started in Italy.', true, 'The Renaissance began in Florence, Italy, in the 14th century.', ['renaissance']),
  fc(C.HISTORY, D.EASY, 'Who painted the Mona Lisa?', ['Michelangelo','Raphael','Da Vinci','Botticelli'], 'c', 'Leonardo da Vinci painted the Mona Lisa around 1503-1519.', ['art','renaissance']),
  fb(C.HISTORY, D.EASY, 'The last shogunate in Japan was the ___ shogunate.', 'Tokugawa', ['Tokugawa','tokugawa'], 'The Tokugawa shogunate ruled from 1603 to 1868.', ['japanese']),
  fc(C.HISTORY, D.EASY, 'Which event started World War I?', ['Pearl Harbor','Assassination of Archduke Ferdinand','Fall of Berlin','D-Day'], 'b', 'The assassination of Archduke Franz Ferdinand in 1914 triggered WWI.', ['wwi']),
  fc(C.HISTORY, D.EASY, 'The French Revolution began in which year?', ['1776','1789','1812','1848'], 'b', 'The French Revolution began in 1789 with the storming of the Bastille.', ['french']),
  // Normal (15)
  fc(C.HISTORY, D.NORMAL, 'What was the Silk Road?', ['A river','A trade route','A wall','A religion'], 'b', 'The Silk Road was a network of trade routes connecting East and West.', ['trade','ancient']),
  fc(C.HISTORY, D.NORMAL, 'Who was the first Emperor of Japan (mythological)?', ['Meiji','Jimmu','Tokugawa','Oda'], 'b', 'Emperor Jimmu is the mythological first emperor (660 BC).', ['japanese','emperor']),
  tf(C.HISTORY, D.NORMAL, 'The atomic bombs were dropped on Hiroshima and Nagasaki.', true, 'The US dropped atomic bombs on Hiroshima (Aug 6) and Nagasaki (Aug 9), 1945.', ['wwii','japanese']),
  fc(C.HISTORY, D.NORMAL, 'Which dynasty built the Great Wall of China?', ['Han','Song','Ming','Qin'], 'd', 'Emperor Qin Shi Huang began building the Great Wall in the 3rd century BC.', ['chinese']),
  fb(C.HISTORY, D.NORMAL, 'The period of Japanese isolation from 1639-1853 is called ___.', 'Sakoku', ['Sakoku','sakoku','鎖国'], 'Sakoku (鎖国) means "locked country" – Japan restricted foreign trade.', ['japanese']),
  fc(C.HISTORY, D.NORMAL, 'Who wrote the Communist Manifesto?', ['Lenin','Stalin','Marx and Engels','Trotsky'], 'c', 'Karl Marx and Friedrich Engels published it in 1848.', ['politics']),
  fc(C.HISTORY, D.NORMAL, 'The Cold War was primarily between which two nations?', ['UK and France','USA and USSR','China and Japan','Germany and Italy'], 'b', 'The Cold War (1947-1991) was between the USA and the Soviet Union.', ['cold_war']),
  tf(C.HISTORY, D.NORMAL, 'The Ottoman Empire lasted over 600 years.', true, 'The Ottoman Empire existed from 1299 to 1922 (623 years).', ['ottoman']),
  fc(C.HISTORY, D.NORMAL, 'What was the capital of the Byzantine Empire?', ['Rome','Athens','Constantinople','Alexandria'], 'c', 'Constantinople (now Istanbul) was the Byzantine capital.', ['byzantine']),
  fc(C.HISTORY, D.NORMAL, 'Which treaty ended World War I?', ['Treaty of Paris','Treaty of Versailles','Treaty of Vienna','Treaty of Rome'], 'b', 'The Treaty of Versailles was signed on June 28, 1919.', ['wwi']),
  fc(C.HISTORY, D.NORMAL, 'Who unified Japan in the late 16th century?', ['Tokugawa Ieyasu','Oda Nobunaga','Toyotomi Hideyoshi','Minamoto Yoritomo'], 'c', 'Toyotomi Hideyoshi completed the unification of Japan in 1590.', ['japanese']),
  tf(C.HISTORY, D.NORMAL, 'The Industrial Revolution began in Britain.', true, 'The Industrial Revolution started in Britain in the late 18th century.', ['industrial']),
  fb(C.HISTORY, D.NORMAL, 'The ancient Greek city-state famous for its warriors was ___.', 'Sparta', ['Sparta','sparta'], 'Spartan warriors were legendary for their military training.', ['greek','ancient']),
  fc(C.HISTORY, D.NORMAL, 'When did Japan open to the West (Perry\'s arrival)?', ['1776','1823','1853','1868'], 'c', 'Commodore Perry arrived in Japan in 1853.', ['japanese']),
  fc(C.HISTORY, D.NORMAL, 'Who was the first woman to win a Nobel Prize?', ['Marie Curie','Rosalind Franklin','Ada Lovelace','Florence Nightingale'], 'a', 'Marie Curie won the Nobel Prize in Physics in 1903.', ['science','nobel']),
  // Hard (10)
  fc(C.HISTORY, D.HARD, 'What was the Sengoku period in Japan?', ['Peaceful era','Age of warring states','Modern era','Colonial period'], 'b', 'The Sengoku period (1467-1615) was marked by constant civil war.', ['japanese']),
  fc(C.HISTORY, D.HARD, 'Which battle is considered the beginning of the end of Napoleon?', ['Austerlitz','Trafalgar','Waterloo','Leipzig'], 'c', 'The Battle of Waterloo (1815) ended Napoleon\'s rule.', ['napoleon']),
  tf(C.HISTORY, D.HARD, 'The Rosetta Stone helped decode Egyptian hieroglyphics.', true, 'Jean-François Champollion used the Rosetta Stone to decipher hieroglyphics in 1822.', ['ancient','egypt']),
  fc(C.HISTORY, D.HARD, 'What year was the Magna Carta signed?', ['1066','1215','1415','1588'], 'b', 'The Magna Carta was sealed in 1215, limiting royal power.', ['british','medieval']),
  fb(C.HISTORY, D.HARD, 'Japan\'s first permanent capital city was ___.', 'Nara', ['Nara','nara'], 'Nara became the first fixed capital in 710 AD.', ['japanese','ancient']),
  fc(C.HISTORY, D.HARD, 'The Mongol Empire was founded by whom?', ['Kublai Khan','Attila','Genghis Khan','Tamerlane'], 'c', 'Genghis Khan founded the Mongol Empire in 1206.', ['mongol']),
  fc(C.HISTORY, D.HARD, 'What was the Meiji Constitution year?', ['1868','1889','1912','1945'], 'b', 'The Meiji Constitution was promulgated in 1889.', ['japanese','law']),
  tf(C.HISTORY, D.HARD, 'The Spanish Inquisition lasted over 350 years.', true, 'The Spanish Inquisition lasted from 1478 to 1834.', ['spanish']),
  fc(C.HISTORY, D.HARD, 'Which civilization invented writing first?', ['Egyptian','Chinese','Sumerian','Indus'], 'c', 'Sumerians developed cuneiform writing around 3400 BC.', ['ancient','mesopotamia']),
  fc(C.HISTORY, D.HARD, 'What event marked the start of the Heian period?', ['Capital moved to Heian-kyo','Samurai class formed','Buddhism arrived','Tokugawa took power'], 'a', 'The capital moved to Heian-kyo (Kyoto) in 794 AD.', ['japanese']),

  // ========================================================================
  // SPORTS (40 questions)
  // ========================================================================
  // Easy (15)
  fc(C.SPORTS, D.EASY, 'How many players are on a soccer team?', ['9','10','11','12'], 'c', 'A soccer team has 11 players on the field.', ['soccer']),
  fc(C.SPORTS, D.EASY, 'Which sport uses a bat and ball?', ['Soccer','Basketball','Baseball','Tennis'], 'c', 'Baseball uses a bat to hit a thrown ball.', ['baseball']),
  tf(C.SPORTS, D.EASY, 'The Olympics are held every 4 years.', true, 'Both Summer and Winter Olympics are held every 4 years.', ['olympics']),
  fc(C.SPORTS, D.EASY, 'What sport is played at Wimbledon?', ['Golf','Cricket','Tennis','Rugby'], 'c', 'Wimbledon is the oldest and most prestigious tennis tournament.', ['tennis']),
  fb(C.SPORTS, D.EASY, 'The national sport of Japan is ___.', 'sumo', ['sumo','Sumo','相撲'], 'Sumo wrestling has ancient roots in Japanese Shinto rituals.', ['japanese','sumo']),
  fc(C.SPORTS, D.EASY, 'How many rings are on the Olympic flag?', ['3','4','5','6'], 'c', 'The five Olympic rings represent the five continents.', ['olympics']),
  tf(C.SPORTS, D.EASY, 'A marathon is 42.195 kilometers.', true, 'The marathon distance was standardized at 42.195 km in 1921.', ['athletics']),
  fc(C.SPORTS, D.EASY, 'Which country hosted the 2020 Olympics?', ['China','Brazil','Japan','France'], 'c', 'The 2020 Olympics were held in Tokyo (delayed to 2021).', ['olympics','japanese']),
  fc(C.SPORTS, D.EASY, 'In basketball, how many points is a free throw worth?', ['1','2','3','4'], 'a', 'A free throw is worth 1 point.', ['basketball']),
  fc(C.SPORTS, D.EASY, 'What sport does Shohei Ohtani play?', ['Soccer','Basketball','Baseball','Tennis'], 'c', 'Shohei Ohtani is a baseball player known as a two-way player.', ['baseball','japanese']),
  tf(C.SPORTS, D.EASY, 'Golf originated in Scotland.', true, 'Modern golf originated in 15th-century Scotland.', ['golf']),
  fc(C.SPORTS, D.EASY, 'Which ball is biggest?', ['Tennis ball','Baseball','Basketball','Golf ball'], 'c', 'A basketball has a diameter of about 24 cm.', ['general']),
  fc(C.SPORTS, D.EASY, 'What color belt is the highest in karate?', ['White','Blue','Red','Black'], 'd', 'Black belt represents mastery in karate.', ['martial_arts']),
  fb(C.SPORTS, D.EASY, 'The World Cup is a tournament for which sport?', 'soccer', ['soccer','football','Soccer','Football'], 'The FIFA World Cup is the biggest soccer tournament.', ['soccer']),
  fc(C.SPORTS, D.EASY, 'How many innings are in a standard baseball game?', ['7','8','9','10'], 'c', 'A standard baseball game consists of 9 innings.', ['baseball']),
  // Normal (15)
  fc(C.SPORTS, D.NORMAL, 'Which country has won the most FIFA World Cups?', ['Germany','Argentina','Italy','Brazil'], 'd', 'Brazil has won the FIFA World Cup 5 times.', ['soccer']),
  fc(C.SPORTS, D.NORMAL, 'What is the highest rank in sumo?', ['Ozeki','Sekiwake','Yokozuna','Komusubi'], 'c', 'Yokozuna (横綱) is the highest rank in sumo.', ['sumo','japanese']),
  tf(C.SPORTS, D.NORMAL, 'The Tour de France is a cycling race.', true, 'The Tour de France is the world\'s most famous cycling race.', ['cycling']),
  fc(C.SPORTS, D.NORMAL, 'How many sets does a player need to win in men\'s Grand Slam tennis?', ['2','3','4','5'], 'b', 'Men need to win 3 out of 5 sets in Grand Slam matches.', ['tennis']),
  fb(C.SPORTS, D.NORMAL, 'The Japanese martial art of "the way of the sword" is called ___.', 'kendo', ['kendo','Kendo','剣道'], 'Kendo (剣道) uses bamboo swords (shinai) and protective armor.', ['martial_arts','japanese']),
  fc(C.SPORTS, D.NORMAL, 'Which athlete has won the most Olympic gold medals?', ['Usain Bolt','Carl Lewis','Michael Phelps','Mark Spitz'], 'c', 'Michael Phelps won 23 Olympic gold medals in swimming.', ['olympics']),
  fc(C.SPORTS, D.NORMAL, 'What is a "perfect game" in baseball?', ['No hits allowed','No runs allowed','No batter reaches base','Scoring in every inning'], 'c', 'A perfect game means no opposing batter reaches base for 27 straight outs.', ['baseball']),
  tf(C.SPORTS, D.NORMAL, 'Judo originated in Japan.', true, 'Judo was created by Jigoro Kano in 1882.', ['martial_arts','japanese']),
  fc(C.SPORTS, D.NORMAL, 'The NBA championship trophy is named after whom?', ['Michael Jordan','Larry Bird','Larry O\'Brien','Bill Russell'], 'c', 'The Larry O\'Brien Championship Trophy has been awarded since 1977.', ['basketball']),
  fc(C.SPORTS, D.NORMAL, 'In which year were the first modern Olympics held?', ['1886','1896','1900','1904'], 'b', 'The first modern Olympics were held in Athens in 1896.', ['olympics']),
  fc(C.SPORTS, D.NORMAL, 'What is "ekiden" in Japan?', ['A stadium','A relay marathon','A wrestling match','A swimming event'], 'b', 'Ekiden is a long-distance relay road race popular in Japan.', ['japanese','running']),
  tf(C.SPORTS, D.NORMAL, 'Cricket matches can last up to 5 days.', true, 'Test cricket matches are played over a maximum of 5 days.', ['cricket']),
  fc(C.SPORTS, D.NORMAL, 'Which country invented table tennis?', ['China','Japan','England','Sweden'], 'c', 'Table tennis originated in England in the 1880s as a parlor game.', ['table_tennis']),
  fb(C.SPORTS, D.NORMAL, 'The Japanese word for practice/training in martial arts is ___.', 'keiko', ['keiko','Keiko','稽古'], 'Keiko (稽古) means practice or training.', ['martial_arts','japanese']),
  fc(C.SPORTS, D.NORMAL, 'How many players are on a volleyball team (on court)?', ['5','6','7','8'], 'b', 'Volleyball has 6 players per team on the court.', ['volleyball']),
  // Hard (10)
  fc(C.SPORTS, D.HARD, 'What is the "Triple Crown" in baseball?', ['3 home runs in a game','Leading in BA, HR, and RBI','3 championships','3 perfect games'], 'b', 'The Triple Crown is leading the league in batting average, home runs, and RBIs.', ['baseball']),
  fc(C.SPORTS, D.HARD, 'Which sumo tournament is NOT held in Tokyo?', ['Hatsu basho','Natsu basho','Nagoya basho','Aki basho'], 'c', 'The Nagoya basho is held in Nagoya; the others are in Tokyo or Osaka.', ['sumo','japanese']),
  tf(C.SPORTS, D.HARD, 'The first Asian country to host the Olympics was Japan.', true, 'Tokyo hosted the 1964 Summer Olympics, the first in Asia.', ['olympics','japanese']),
  fc(C.SPORTS, D.HARD, 'What is the diameter of a basketball hoop in inches?', ['16','18','20','22'], 'b', 'A standard basketball hoop is 18 inches (46 cm) in diameter.', ['basketball']),
  fb(C.SPORTS, D.HARD, 'The founder of judo was ___.', 'Jigoro Kano', ['Jigoro Kano','Kano Jigoro','kano','Kano'], 'Jigoro Kano created judo in 1882.', ['martial_arts','japanese']),
  fc(C.SPORTS, D.HARD, 'Which country has won the most Rugby World Cups?', ['England','Australia','South Africa','New Zealand'], 'd', 'New Zealand (All Blacks) has won 3 Rugby World Cups.', ['rugby']),
  fc(C.SPORTS, D.HARD, 'What year did sumo become professional in Japan?', ['1600s','1700s','1800s','1900s'], 'b', 'Professional sumo began in the early 1700s during the Edo period.', ['sumo','japanese']),
  tf(C.SPORTS, D.HARD, 'The decathlon has 10 events.', true, '"Deca" means ten; the decathlon includes 10 track and field events.', ['athletics']),
  fc(C.SPORTS, D.HARD, 'Who holds the record for most career home runs in NPB?', ['Ichiro Suzuki','Sadaharu Oh','Shigeo Nagashima','Hideki Matsui'], 'b', 'Sadaharu Oh hit 868 career home runs in NPB.', ['baseball','japanese']),
  fc(C.SPORTS, D.HARD, 'In Formula 1, what flag signals the end of the race?', ['Red','Yellow','Green','Checkered'], 'd', 'The checkered flag signals the end of a race.', ['motorsport']),

  // ========================================================================
  // MUSIC & ART (40 questions)
  // ========================================================================
  // Easy (15)
  fc(C.MUSIC_ART, D.EASY, 'Who painted the Mona Lisa?', ['Picasso','Van Gogh','Da Vinci','Monet'], 'c', 'Leonardo da Vinci painted the Mona Lisa around 1503-1519.', ['painting','renaissance']),
  fc(C.MUSIC_ART, D.EASY, 'What instrument has 88 keys?', ['Guitar','Violin','Piano','Flute'], 'c', 'A standard piano has 88 keys (52 white, 36 black).', ['instrument']),
  tf(C.MUSIC_ART, D.EASY, 'Beethoven was a German composer.', true, 'Ludwig van Beethoven was born in Bonn, Germany in 1770.', ['classical','composer']),
  fc(C.MUSIC_ART, D.EASY, 'What is the Mona Lisa\'s real name?', ['La Bella','La Gioconda','La Donna','La Vita'], 'b', 'The painting is also known as "La Gioconda".', ['painting']),
  fb(C.MUSIC_ART, D.EASY, 'The Japanese art of woodblock printing is called ___.', 'ukiyo-e', ['ukiyo-e','Ukiyo-e','浮世絵','ukiyoe'], 'Ukiyo-e (浮世絵) means "pictures of the floating world".', ['japanese','art']),
  fc(C.MUSIC_ART, D.EASY, 'Which instrument has strings and a bow?', ['Trumpet','Drum','Violin','Flute'], 'c', 'The violin is played with a bow across its four strings.', ['instrument']),
  tf(C.MUSIC_ART, D.EASY, 'Mozart was an Austrian composer.', true, 'Wolfgang Amadeus Mozart was born in Salzburg, Austria in 1756.', ['classical','composer']),
  fc(C.MUSIC_ART, D.EASY, 'What is origami?', ['Painting','Paper folding','Calligraphy','Pottery'], 'b', 'Origami is the Japanese art of paper folding.', ['japanese','craft']),
  fc(C.MUSIC_ART, D.EASY, 'Which museum is the Mona Lisa in?', ['British Museum','Prado','Louvre','Met'], 'c', 'The Mona Lisa is displayed in the Louvre Museum in Paris.', ['museum']),
  fc(C.MUSIC_ART, D.EASY, 'What color do you get by mixing blue and yellow?', ['Purple','Orange','Green','Brown'], 'c', 'Blue and yellow make green.', ['color_theory']),
  tf(C.MUSIC_ART, D.EASY, 'A guitar typically has 6 strings.', true, 'A standard acoustic guitar has 6 strings.', ['instrument']),
  fc(C.MUSIC_ART, D.EASY, 'Who composed "Für Elise"?', ['Mozart','Bach','Beethoven','Chopin'], 'c', 'Beethoven composed "Für Elise" around 1810.', ['classical']),
  fb(C.MUSIC_ART, D.EASY, 'The famous Japanese wave painting is by ___.', 'Hokusai', ['Hokusai','hokusai','葛飾北斎'], 'Katsushika Hokusai created "The Great Wave off Kanagawa".', ['japanese','artist']),
  fc(C.MUSIC_ART, D.EASY, 'What is a "fresco"?', ['A sculpture','Painting on wet plaster','A type of music','A dance'], 'b', 'Fresco is a mural painting technique on freshly applied plaster.', ['technique']),
  fc(C.MUSIC_ART, D.EASY, 'Which of these is a percussion instrument?', ['Piano','Violin','Drum','Flute'], 'c', 'Drums are struck to produce sound, making them percussion instruments.', ['instrument']),
  // Normal (15)
  fc(C.MUSIC_ART, D.NORMAL, 'Who painted "Starry Night"?', ['Monet','Van Gogh','Picasso','Cézanne'], 'b', 'Vincent van Gogh painted "The Starry Night" in 1889.', ['painting']),
  fc(C.MUSIC_ART, D.NORMAL, 'What is the Japanese bamboo flute called?', ['Koto','Shamisen','Shakuhachi','Taiko'], 'c', 'The shakuhachi is a bamboo flute used in Japanese music.', ['japanese','instrument']),
  tf(C.MUSIC_ART, D.NORMAL, 'Impressionism originated in France.', true, 'Impressionism began in 1860s Paris with artists like Monet and Renoir.', ['art_movement']),
  fc(C.MUSIC_ART, D.NORMAL, 'Who sculpted "David"?', ['Da Vinci','Raphael','Michelangelo','Donatello'], 'c', 'Michelangelo sculpted David between 1501-1504.', ['sculpture','renaissance']),
  fb(C.MUSIC_ART, D.NORMAL, 'The Japanese stringed instrument with 13 strings is called ___.', 'koto', ['koto','Koto','琴'], 'The koto (琴) is a traditional Japanese stringed instrument.', ['japanese','instrument']),
  fc(C.MUSIC_ART, D.NORMAL, 'What art movement did Salvador Dalí represent?', ['Cubism','Impressionism','Surrealism','Pop Art'], 'c', 'Dalí was a leading Surrealist known for dreamlike imagery.', ['art_movement']),
  fc(C.MUSIC_ART, D.NORMAL, 'Which period came first: Baroque or Classical?', ['Classical','Baroque','They were simultaneous','Romantic'], 'b', 'Baroque (~1600-1750) preceded Classical (~1730-1820).', ['classical','period']),
  tf(C.MUSIC_ART, D.NORMAL, 'The taiko is a Japanese drum.', true, 'Taiko (太鼓) drums have been used in Japan for centuries.', ['japanese','instrument']),
  fc(C.MUSIC_ART, D.NORMAL, 'Who composed "The Four Seasons"?', ['Bach','Vivaldi','Handel','Haydn'], 'b', 'Antonio Vivaldi composed "The Four Seasons" around 1723.', ['classical']),
  fc(C.MUSIC_ART, D.NORMAL, 'What style of art uses small dots of color?', ['Cubism','Pointillism','Abstract','Realism'], 'b', 'Pointillism uses small distinct dots of color to form an image.', ['technique']),
  fc(C.MUSIC_ART, D.NORMAL, 'Who created the art installation "Infinity Mirrors"?', ['Ai Weiwei','Yayoi Kusama','Takashi Murakami','Yoshitomo Nara'], 'b', 'Yayoi Kusama is famous for her immersive infinity mirror rooms.', ['japanese','contemporary']),
  tf(C.MUSIC_ART, D.NORMAL, 'Jazz originated in New Orleans.', true, 'Jazz developed in New Orleans in the late 19th/early 20th century.', ['jazz','genre']),
  fb(C.MUSIC_ART, D.NORMAL, 'The Japanese art of flower arrangement is called ___.', 'ikebana', ['ikebana','Ikebana','生け花'], 'Ikebana emphasizes harmony, balance, and minimalism.', ['japanese','art']),
  fc(C.MUSIC_ART, D.NORMAL, 'Which artist is known for Campbell\'s Soup Cans?', ['Lichtenstein','Warhol','Hockney','Basquiat'], 'b', 'Andy Warhol created the iconic Campbell\'s Soup Cans in 1962.', ['pop_art']),
  fc(C.MUSIC_ART, D.NORMAL, 'What key signature has no sharps or flats?', ['G major','D major','C major','F major'], 'c', 'C major has no sharps or flats.', ['music_theory']),
  // Hard (10)
  fc(C.MUSIC_ART, D.HARD, 'Who composed "The Rite of Spring"?', ['Debussy','Ravel','Stravinsky','Prokofiev'], 'c', 'Igor Stravinsky\'s "The Rite of Spring" (1913) caused a riot at its premiere.', ['classical']),
  fc(C.MUSIC_ART, D.HARD, 'What is "ma" in Japanese aesthetics?', ['Color','Negative space/pause','Texture','Movement'], 'b', 'Ma (間) is the concept of negative space and meaningful pauses.', ['japanese','philosophy']),
  tf(C.MUSIC_ART, D.HARD, 'The shamisen has 3 strings.', true, 'The shamisen (三味線) has 3 strings, as its name suggests (三 = three).', ['japanese','instrument']),
  fc(C.MUSIC_ART, D.HARD, 'Which art movement was Pablo Picasso co-founder of?', ['Surrealism','Fauvism','Cubism','Dadaism'], 'c', 'Picasso and Georges Braque co-founded Cubism around 1907.', ['art_movement']),
  fb(C.MUSIC_ART, D.HARD, 'The Japanese theatrical art form using masks is called ___.', 'Noh', ['Noh','noh','能'], 'Noh (能) theater dates back to the 14th century.', ['japanese','theater']),
  fc(C.MUSIC_ART, D.HARD, 'What is chiaroscuro?', ['A musical term','Contrast of light and dark','A sculpture type','A dance'], 'b', 'Chiaroscuro uses strong contrast between light and dark for dramatic effect.', ['technique']),
  fc(C.MUSIC_ART, D.HARD, 'Which composer became deaf later in life?', ['Mozart','Bach','Beethoven','Chopin'], 'c', 'Beethoven began losing his hearing in his late 20s.', ['classical','composer']),
  tf(C.MUSIC_ART, D.HARD, 'The "Superflat" art movement was founded by Takashi Murakami.', true, 'Murakami\'s Superflat blends traditional Japanese art with anime and pop culture.', ['japanese','contemporary']),
  fc(C.MUSIC_ART, D.HARD, 'What interval is a "tritone"?', ['3 semitones','4 semitones','6 semitones','8 semitones'], 'c', 'A tritone spans 6 semitones, historically called "diabolus in musica".', ['music_theory']),
  fc(C.MUSIC_ART, D.HARD, 'Who wrote "The Tale of Genji", considered the world\'s first novel?', ['Sei Shōnagon','Murasaki Shikibu','Matsuo Bashō','Lady Nijō'], 'b', 'Murasaki Shikibu wrote it in the early 11th century during the Heian period.', ['japanese','literature']),
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getQuestionsByFilter(
  category?: QuizCategory,
  difficulty?: QuizDifficulty,
  types?: QuestionType[],
): Question[] {
  return QUESTION_BANK.filter(question => {
    if (category && question.category !== category) return false;
    if (difficulty && question.difficulty !== difficulty) return false;
    if (types && types.length > 0 && !types.includes(question.type)) return false;
    return true;
  });
}

export function getRandomQuestions(
  count: number,
  category?: QuizCategory,
  difficulty?: QuizDifficulty,
  types?: QuestionType[],
): Question[] {
  const filtered = getQuestionsByFilter(category, difficulty, types);
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function getAvailableCategories(): { category: QuizCategory; count: number }[] {
  const counts: Partial<Record<QuizCategory, number>> = {};
  for (const question of QUESTION_BANK) {
    counts[question.category] = (counts[question.category] || 0) + 1;
  }
  return Object.entries(counts).map(([category, count]) => ({
    category: category as QuizCategory,
    count: count!,
  }));
}

export function getRandomCategory(): QuizCategory {
  const categories = Object.values(QuizCategory).filter(c => c !== QuizCategory.CUSTOM);
  return categories[Math.floor(Math.random() * categories.length)];
}
