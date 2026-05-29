// backend/src/config/feed-registry.ts
export type PipelineCountry = 'NG' | 'US' | 'GB' | 'AU' | 'CA' | 'ZA' | 'IN' | 'Global';

export const COUNTRY_CONFIG: Record<PipelineCountry, {
  gl: string;
  ceid: string;
  registry: string[];
  fallback: string[];
}> = {
  NG: {
    gl: 'NG', ceid: 'NG:en',
    registry: [
      'https://www.premiumtimesng.com/feed',
      'https://punchng.com/feed/',
      'https://guardian.ng/feed/',
      'https://thenationonlineng.net/feed/',
      'https://www.vanguardngr.com/feed/',
      'https://dailypost.ng/feed/',
      'https://businessday.ng/feed/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
      'https://www.aljazeera.com/xml/rss/all.xml',
    ],
  },
  US: {
    gl: 'US', ceid: 'US:en',
    registry: [
      'https://feeds.npr.org/1001/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
      'https://feeds.washingtonpost.com/rss/national',
      'https://feeds.reuters.com/reuters/topNews',
      'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
    ],
    fallback: [
      'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    ],
  },
  GB: {
    gl: 'GB', ceid: 'GB:en',
    registry: [
      'https://feeds.bbci.co.uk/news/uk/rss.xml',
      'https://www.theguardian.com/uk/rss',
      'https://feeds.skynews.com/feeds/rss/uk.xml',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  AU: {
    gl: 'AU', ceid: 'AU:en',
    registry: [
      'https://www.abc.net.au/news/feed/51120/rss.xml',
      'https://www.smh.com.au/rss/feed.xml',
      'https://www.theaustralian.com.au/feed/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  CA: {
    gl: 'CA', ceid: 'CA:en',
    registry: [
      'https://www.cbc.ca/cmlink/rss-topstories',
      'https://globalnews.ca/feed/',
      'https://nationalpost.com/feed/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  ZA: {
    gl: 'ZA', ceid: 'ZA:en',
    registry: [
      'https://www.dailymaverick.co.za/dmrss/',
      'https://ewn.co.za/RSS%20Feeds/Latest%20News',
      'https://www.news24.com/rss',
      'https://www.timeslive.co.za/rss/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
    ],
  },
  IN: {
    gl: 'IN', ceid: 'IN:en',
    registry: [
      'https://feeds.feedburner.com/ndtvnews-top-stories',
      'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
      'https://www.thehindu.com/feeder/default.rss',
      'https://indianexpress.com/feed/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
    ],
  },
  Global: {
    gl: 'US', ceid: 'US:en',
    registry: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
      'https://www.aljazeera.com/xml/rss/all.xml',
      'https://rss.dw.com/rdf/rss-en-all',
      'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
      'https://feeds.reuters.com/reuters/topNews',
    ],
    fallback: [],
  },
};

export const COUNTRY_TOPIC_REGISTRY: Partial<Record<PipelineCountry, Partial<Record<string, string[]>>>> = {
  NG: {
    law: [
      'https://barristerng.com/feed/',
      'https://www.courtroommail.com/feed/',
      'https://dnllegalandstyle.com/feed/',
    ],
    finance: [
      'https://nairametrics.com/feed/',
      'https://businessday.ng/category/business-economy/feed/',
      'https://www.premiumtimesng.com/category/business/feed/',
      'https://proshare.co/feed/',
      'https://nairametrics.com/category/financial-literacy-for-nigerians/personal-finance/feed/',
    ],
    technology: [
      'https://techcabal.com/feed/',
      'https://techpoint.africa/feed/',
      'https://rss.punchng.com/v1/category/technology',
      'https://www.vanguardngr.com/category/technology/feed/',
      'https://guardian.ng/category/technology/feed/',
    ],
    health: [
      'https://rss.punchng.com/v1/category/health',
      'https://www.premiumtimesng.com/category/news/health/feed/',
      'https://www.vanguardngr.com/category/health/feed/',
      'https://thenationonlineng.net/category/health/feed/',
    ],
    education: [
      'https://rss.punchng.com/v1/category/education',
      'https://www.vanguardngr.com/category/education/feed/',
      'https://dailypost.ng/education/feed/',
      // removed: https://guardian.ng/category/features/education/feed/ — 403
    ],
    politics: [
      'https://rss.punchng.com/v1/category/politics',
      'https://www.vanguardngr.com/category/politics/feed/',
      'https://www.premiumtimesng.com/category/news/politics/feed/',
      'https://thenationonlineng.net/category/politics/feed/',
      'https://dailypost.ng/politics/feed/',
    ],
    business: [
      'https://rss.punchng.com/v1/category/business',
      'https://www.vanguardngr.com/category/business/feed/',
      'https://guardian.ng/category/business/feed/',
      'https://thenationonlineng.net/category/business/feed/',
      'https://dailypost.ng/business/feed/',
    ],
    sports: [
      'https://rss.punchng.com/v1/category/sports',
      'https://www.vanguardngr.com/category/sports/feed/',
      'https://dailypost.ng/sport/feed/',
      'https://guardian.ng/category/sport/feed/',
      'https://thenationonlineng.net/category/sports/feed/',
    ],
    entertainment: [
      'https://rss.punchng.com/v1/category/entertainment',
      'https://www.vanguardngr.com/category/entertainment/feed/',
      'https://dailypost.ng/entertainment/feed/',
      'https://www.premiumtimesng.com/category/entertainment/feed/',
      'https://www.bellanaija.com/feed/',
    ],
    realestate: [
      'https://www.vanguardngr.com/category/homes-property/feed/',
      'https://guardian.ng/category/property/feed/',
      'https://businessday.ng/category/real-estate/feed/',
    ],
    agriculture: [
      'https://businessday.ng/category/agriculture/feed/',
      'https://nairametrics.com/category/agriculture/feed/',
      'https://www.premiumtimesng.com/category/agriculture/feed/',
      'https://guardian.ng/category/features/agro-care/feed/',
    ],
    energy: [
      'https://www.vanguardngr.com/category/sweet-crude/feed/',
      'https://businessday.ng/category/energy/feed/',
      'https://sweetcrudereports.com/feed/',
      'https://www.premiumtimesng.com/category/business/energy/feed/',
    ],
    travel: [
      'https://www.vanguardngr.com/category/travel-tourism/feed/',
      'https://guardian.ng/category/life/travel/feed/',
      'https://businesspost.ng/category/travel/feed/',
    ],
    religion: [
      'https://www.vanguardngr.com/category/worship/feed/',
      'https://dailypost.ng/religion/feed/',
      'https://thenationonlineng.net/category/religion/feed/',
    ],
  },

  US: {
    law: [
      'https://legalreader.com/feed/',
      'https://www.abajournal.com/feeds/rss/',
      'https://rss.nytimes.com/services/xml/rss/nyt/Law.xml',
    ],
    finance: [
      'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
      'https://feeds.reuters.com/reuters/businessNews',
    ],
    technology: [
      'https://www.cnet.com/rss/news/',
      'https://feeds.arstechnica.com/arstechnica/index',
      'https://gizmodo.com/rss',
      'https://feeds.feedburner.com/TechCrunch',
    ],
    health: [
      'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
      'https://www.npr.org/rss/rss.php?id=1128',
      'https://www.medpagetoday.com/rss/Headlines.xml',
    ],
    education: [
      'https://www.edweek.org/feed/',
      'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml',
    ],
    politics: [
      'https://rss.politico.com/politics-news.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
      'https://feeds.foxnews.com/foxnews/politics',
    ],
    business: [
      'https://feeds.washingtonpost.com/rss/business',
      'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    ],
    sports: [
      'https://www.espn.com/espn/rss/news',
      'https://sports.yahoo.com/rss/',
      'https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml',
    ],
    entertainment: [
      'https://tv.avclub.com/rss',
      'https://www.tvfanatic.com/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml',
    ],
    realestate: [
      'https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml',
      'https://www.realtor.com/news/feed/',
    ],
    agriculture: [
      'https://www.agweb.com/rss/news',
      'https://www.usda.gov/rss/home.xml',
    ],
    energy: [
      'https://www.eia.gov/rss/todayinenergy.xml',
      'https://www.power-eng.com/feed/',
    ],
    travel: [
      'https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml',
      'https://www.nomadicmatt.com/travel-blog/feed/',
      'https://www.lonelyplanet.com/news/feed/atom/',
    ],
    religion: [
      'https://religionnews.com/feed/',
      'https://www.christianitytoday.com/rss/',
    ],
  },

  GB: {
    law: [
      'https://lawgazette.co.uk/17.rss',
      'https://legalcheek.com/feed/',
    ],
    finance: [
      'https://feeds.bbci.co.uk/news/business/rss.xml',
      'https://www.theguardian.com/business/economics/rss',
    ],
    technology: [
      'https://feeds.bbci.co.uk/news/technology/rss.xml',
      'https://www.theguardian.com/technology/rss',
    ],
    health: [
      'https://feeds.bbci.co.uk/news/health/rss.xml',
      'https://www.theguardian.com/society/health/rss',
    ],
    education: [
      'https://feeds.bbci.co.uk/news/education/rss.xml',
      'https://www.theguardian.com/education/rss',
    ],
    politics: [
      'https://feeds.bbci.co.uk/news/politics/rss.xml',
      'https://www.theguardian.com/politics/rss',
    ],
    business: [
      'https://www.theguardian.com/business/rss',
      'https://www.telegraph.co.uk/business/rss.xml',
    ],
    sports: [
      'https://feeds.bbci.co.uk/sport/rss.xml',
      'https://www.theguardian.com/uk/sport/rss',
    ],
    entertainment: [
      'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
      'https://www.dailymail.co.uk/tvshowbiz/index.rss',
    ],
    realestate: [
      'https://www.theguardian.com/money/property/rss',
      'https://www.telegraph.co.uk/property/rss.xml',
    ],
    agriculture: [
      'https://www.fwi.co.uk/feed',
    ],
    energy: [
      'https://www.energyvoice.com/feed/',
      'https://www.current-news.co.uk/feed/',
    ],
    travel: [
      'https://www.theguardian.com/uk/travel/rss',
      'https://www.telegraph.co.uk/travel/rss.xml',
    ],
    religion: [
      'https://www.churchtimes.co.uk/rss',
    ],
  },

  AU: {
    law: [
      'https://www.lawyersweekly.com.au/feed/',
      'https://www.smh.com.au/rss/national/nsw/courts-and-law.xml',
    ],
    finance: [
      'https://www.abc.net.au/news/feed/51892/rss.xml',
      'https://www.smh.com.au/rss/business.xml',
    ],
    technology: [
      'https://www.itnews.com.au/RSS/rss.ashx',
      'https://www.smh.com.au/rss/technology.xml',
    ],
    health: [
      'https://www.abc.net.au/news/feed/51120/rss.xml?category=health',
    ],
    education: [
      'https://educationhq.com/feed/',
    ],
    politics: [
      'https://www.abc.net.au/news/feed/52342/rss.xml',
      'https://www.smh.com.au/rss/politics/federal.xml',
    ],
    business: [
      'https://www.smh.com.au/rss/business.xml',
      'https://www.michaelwest.com.au/feed/',
    ],
    sports: [
      'https://www.abc.net.au/news/feed/45924/rss.xml',
      'https://www.foxsports.com.au/content-feeds/rss/',
    ],
    entertainment: [
      'https://www.abc.net.au/news/feed/51854/rss.xml',
      'https://www.smh.com.au/rss/culture.xml',
    ],
    realestate: [
      'https://www.smh.com.au/rss/property.xml',
    ],
    agriculture: [
      'https://www.abc.net.au/news/feed/51120/rss.xml?category=rural',
    ],
    energy: [
      'https://reneweconomy.com.au/feed/',
    ],
    travel: [
      'https://www.smh.com.au/rss/traveller.xml',
    ],
    religion: [
      'https://www.eternitynews.com.au/feed/',
    ],
  },

  CA: {
    law: [
      'https://www.canadianlawyermag.com/rss',
      'https://www.lawtimesnews.com/rss',
      'https://www.slaw.ca/feed/',
    ],
    finance: [
      'https://business.financialpost.com/feed/',
      'https://www.theglobeandmail.com/investing/?service=rss',
    ],
    technology: [
      'https://betakit.com/feed/',
      'https://globalnews.ca/tech/feed/',
    ],
    health: [
      'https://www.cbc.ca/cmlink/rss-health',
      'https://globalnews.ca/health/feed/',
    ],
    education: [
      'https://www.universityaffairs.ca/feed/',
      'https://globalnews.ca/education/feed/',
    ],
    politics: [
      'https://www.cbc.ca/cmlink/rss-politics',
      'https://globalnews.ca/politics/feed/',
    ],
    business: [
      'https://www.cbc.ca/cmlink/rss-business',
      'https://www.canadianbusiness.com/feed/',
    ],
    sports: [
      'https://www.cbc.ca/cmlink/rss-sports',
      'https://www.tsn.ca/rss/sports.xml',
    ],
    entertainment: [
      'https://www.cbc.ca/cmlink/rss-arts',
      'https://globalnews.ca/entertainment/feed/',
    ],
    realestate: [
      'https://globalnews.ca/real-estate/feed/',
    ],
    agriculture: [
      'https://www.realagriculture.com/feed/',
    ],
    energy: [
      'https://globalnews.ca/environment/feed/',
    ],
    travel: [
      'https://globalnews.ca/travel/feed/',
    ],
    religion: [
      'https://canadiancatholicnews.ca/feed/',
    ],
  },

  ZA: {
    law: [
      'https://www.derebus.org.za/feed/',
      'https://www.derebus.org.za/category/columns/feed/',
    ],
    finance: [
      'https://www.moneyweb.co.za/feed/',
      'https://businesstech.co.za/news/feed/',
    ],
    technology: [
      'https://techcentral.co.za/feed/',
      'https://mybroadband.co.za/news/feed',
    ],
    health: [
      'https://www.news24.com/health24/rss',
    ],
    education: [
      'https://www.dailymaverick.co.za/section/education/feed/',
    ],
    politics: [
      'https://www.dailymaverick.co.za/dmrss/',
      'https://ewn.co.za/RSS%20Feeds/Latest%20News',
    ],
    business: [
      'https://www.businessinsider.co.za/rss',
      'https://citizen.co.za/category/business/feed/',
    ],
    sports: [
      'https://www.timeslive.co.za/rss/?section=sport',
      'https://sacricketmag.com/feed/',
    ],
    entertainment: [
      'https://www.timeslive.co.za/rss/?section=entertainment',
    ],
    realestate: [
      'https://www.property24.com/articles/rss',
    ],
    agriculture: [
      'https://www.farmersweekly.co.za/feed/',
    ],
    energy: [
      'https://businesstech.co.za/news/category/energy/feed/',
    ],
    travel: [
      'https://www.getaway.co.za/feed/',
    ],
    religion: [
      'https://gatewaynews.co.za/feed/',
    ],
  },

  IN: {
    law: [
      'https://www.livelaw.in/feed/',
      'https://www.barandbench.com/feed/',
    ],
    finance: [
      'https://www.livemint.com/rss/news',
      'https://economictimes.indiatimes.com/rssfeedsdefault.cms',
    ],
    technology: [
      'https://inc42.com/feed/',
      'https://www.digit.in/feed/',
    ],
    health: [
      'https://health.economictimes.indiatimes.com/rss/topstories',
    ],
    education: [
      'https://education.indianexpress.com/feed/',
    ],
    politics: [
      'https://swarajyamag.com/topic/rss',
      'https://www.thehindu.com/news/national/feeder/default.rss',
    ],
    business: [
      'https://www.business-standard.com/rss/home_page_top_stories.rss',
      'https://swarajyamag.com/section/economy/feed',
    ],
    sports: [
      'https://sports.ndtv.com/rss/sports',
      'https://www.espncricinfo.com/rss/content/story/feeds/0.xml',
    ],
    entertainment: [
      'https://www.bollywoodhungama.com/rss/news.xml',
      'https://indianexpress.com/section/entertainment/feed/',
    ],
    realestate: [
      'https://realty.economictimes.indiatimes.com/rss/topstories',
    ],
    agriculture: [
      'https://krishijagran.com/feed/',
      'https://krishijagran.com/farm-mechanization/feed/',
    ],
    energy: [
      'https://mercomindia.com/feed/',
      'https://energy.economictimes.indiatimes.com/rss/topstories',
    ],
    travel: [
      'https://www.outlookindia.com/outlooktraveller/rss/',
    ],
    religion: [
      'https://swarajyamag.com/category/culture/feed',
    ],
  },
};

// ─── Generic topic feeds (international fallback) ─────────────────────────────
export const TOPIC_REGISTRY: Record<string, string[]> = {
  law: [
    'https://rss.nytimes.com/services/xml/rss/nyt/Law.xml',
    'https://www.theguardian.com/law/rss',
    'https://legalreader.com/feed/',
  ],
  finance: [
    'https://feeds.reuters.com/reuters/businessNews',
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://www.ft.com/rss/home/uk',
  ],
  technology: [
    'https://www.theverge.com/rss/index.xml',
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://feeds.feedburner.com/TechCrunch',
  ],
  health: [
    'https://feeds.bbci.co.uk/news/health/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
    'https://www.who.int/rss-feeds/news-english.xml',
  ],
  education: [
    'https://feeds.bbci.co.uk/news/education/rss.xml',
    'https://www.theguardian.com/education/rss',
    // removed: https://www.timeshighereducation.com/news/rss — 404
  ],
  politics: [
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
  ],
  business: [
    'https://www.wsj.com/xml/rss/3_7014.xml',
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
  ],
  sports: [
    'https://www.espn.com/espn/rss/news',
    'https://www.skysports.com/rss/12040',
    'https://feeds.bbci.co.uk/sport/rss.xml',
  ],
  entertainment: [
    'https://www.hollywoodreporter.com/feed/',
    'https://variety.com/feed/',
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
  ],
  realestate: [
    'https://www.worldpropertyjournal.com/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml',
    'https://www.theguardian.com/money/property/rss',
  ],
  science: [
    'https://feeds.newscientist.com/home',
    'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
    'https://www.scientificamerican.com/platform/syndication/rss/',
  ],
  travel: [
    'https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml',
    'https://www.lonelyplanet.com/news/feed/atom/',
    'https://www.nationalgeographic.com/travel/rss/',
  ],
  food: [
    'https://feeds.feedburner.com/seriouseats/recipes',
    'https://rss.nytimes.com/services/xml/rss/nyt/DiningandWine.xml',
  ],
  energy: [
    'https://www.oilandgasjournal.com/rss',
    'https://www.theguardian.com/environment/energy/rss',
    'https://oilprice.com/rss/main',
  ],
  agriculture: [
    'https://www.fao.org/news/rss-feed/en/',
    'https://www.theguardian.com/environment/food/rss',
    'https://www.agweb.com/rss/news',
  ],
  religion: [
    'https://www.vaticannews.va/en.rss.xml',
    'https://religionnews.com/feed/',
    'https://www.theguardian.com/world/religion/rss',
  ],
};

// ─── Google News section feeds ────────────────────────────────────────────────
export const GOOGLE_TOPIC_FEEDS: Record<string, string> = {
  education:     'https://news.google.com/rss/headlines/section/topic/EDUCATION?hl=en&gl=US&ceid=US:en',
  politics:      'https://news.google.com/rss/headlines/section/topic/NATION?hl=en&gl=US&ceid=US:en',
  finance:       'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en&gl=US&ceid=US:en',
  technology:    'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en&gl=US&ceid=US:en',
  health:        'https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en&gl=US&ceid=US:en',
  business:      'https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en&gl=US&ceid=US:en',
  sports:        'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en&gl=US&ceid=US:en',
  entertainment: 'https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=en&gl=US&ceid=US:en',
  science:       'https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en&gl=US&ceid=US:en',
};

// ─── Topic aliases ────────────────────────────────────────────────────────────
export const TOPIC_ALIASES: Record<string, string> = {
  'law': 'law', 'legal': 'law', 'court': 'law', 'crime': 'law', 'justice': 'law',
  'attorney': 'law', 'lawyer': 'law', 'litigation': 'law', 'judiciary': 'law',
  'finance': 'finance', 'financial': 'finance', 'money': 'finance', 'economy': 'finance',
  'investment': 'finance', 'crypto': 'finance', 'banking': 'finance', 'forex': 'finance',
  'fintech': 'finance', 'stocks': 'finance', 'trading': 'finance', 'insurance': 'finance',
  'technology': 'technology', 'tech': 'technology', 'software': 'technology',
  'ai': 'technology', 'startup': 'technology', 'cybersecurity': 'technology',
  'gadgets': 'technology', 'programming': 'technology',
  'health': 'health', 'medical': 'health', 'wellness': 'health', 'fitness': 'health',
  'medicine': 'health', 'hospital': 'health', 'pharma': 'health', 'nutrition': 'health',
  'mental health': 'health', 'healthcare': 'health',
  'education': 'education', 'school': 'education', 'academic': 'education',
  'learning': 'education', 'exam': 'education', 'university': 'education',
  'student': 'education', 'curriculum': 'education', 'teacher': 'education',
  'politics': 'politics', 'political': 'politics', 'government': 'politics',
  'election': 'politics', 'policy': 'politics', 'parliament': 'politics',
  'senate': 'politics', 'democracy': 'politics',
  'business': 'business', 'commerce': 'business', 'entrepreneurship': 'business',
  'marketing': 'business', 'ecommerce': 'business', 'retail': 'business',
  'supply chain': 'business', 'logistics': 'business',
  'sports': 'sports', 'sport': 'sports', 'football': 'sports', 'basketball': 'sports',
  'cricket': 'sports', 'tennis': 'sports', 'athletics': 'sports', 'soccer': 'sports',
  'entertainment': 'entertainment', 'music': 'entertainment', 'movies': 'entertainment',
  'film': 'entertainment', 'celebrity': 'entertainment', 'tv': 'entertainment',
  'streaming': 'entertainment', 'gaming': 'entertainment',
  'realestate': 'realestate', 'real estate': 'realestate', 'property': 'realestate',
  'housing': 'realestate', 'mortgage': 'realestate', 'construction': 'realestate',
  'science': 'science', 'research': 'science', 'climate': 'science',
  'environment': 'science', 'space': 'science', 'biology': 'science',
  'travel': 'travel', 'tourism': 'travel', 'hospitality': 'travel', 'aviation': 'travel',
  'food': 'food', 'cooking': 'food', 'recipe': 'food', 'restaurant': 'food', 'culinary': 'food',
  'energy': 'energy', 'oil': 'energy', 'gas': 'energy', 'renewable': 'energy',
  'solar': 'energy', 'electricity': 'energy', 'power': 'energy',
  'agriculture': 'agriculture', 'farming': 'agriculture', 'agric': 'agriculture',
  'crops': 'agriculture', 'livestock': 'agriculture', 'agribusiness': 'agriculture',
  'religion': 'religion', 'faith': 'religion', 'church': 'religion',
  'islam': 'religion', 'christianity': 'religion', 'mosque': 'religion',
};