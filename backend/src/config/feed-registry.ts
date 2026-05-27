// backend/src/config/feed-registry.ts
export type PipelineCountry = 'NG' | 'US' | 'GB' | 'AU' | 'CA' | 'ZA' | 'IN' | 'Global';

// ─── Country base config ──────────────────────────────────────────────────────
// registry: general country-level outlets (no topic filter — broad national news)
// fallback: international sources used only when registry is thin
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
      'https://www.telegraph.co.uk/rss.xml',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  AU: {
    gl: 'AU', ceid: 'AU:en',
    registry: [
      'https://www.abc.net.au/news/feed/51120/rss.xml',
      'https://feeds.smh.com.au/rssheadlines/breaking.xml',
      'https://www.theaustralian.com.au/feed/',
      'https://www.news.com.au/content-feeds/latest-news-national/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  CA: {
    gl: 'CA', ceid: 'CA:en',
    registry: [
      'https://rss.cbc.ca/lineup/topstories.xml',
      'https://globalnews.ca/feed/',
      'https://www.thestar.com/content/thestar/feed.rss',
      'https://nationalpost.com/feed/',
    ],
    fallback: [
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
  },
  ZA: {
    gl: 'ZA', ceid: 'ZA:en',
    registry: [
      'https://www.dailymaverick.co.za/feed/',
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

// ─── Country-specific topic feeds ─────────────────────────────────────────────
// Tried before generic TOPIC_REGISTRY so the AI gate sees local, on-topic content.
// Add new countries/topics here — the service picks them up automatically.
export const COUNTRY_TOPIC_REGISTRY: Partial<Record<PipelineCountry, Partial<Record<string, string[]>>>> = {
  NG: {
    law: [
      'https://thenigerialawyer.com/feed/',
      'https://lawyard.com/feed/',
      'https://www.lawpavilion.com/blog/feed/',
      'https://legalnaija.com/feed/',
      'https://lawlordng.com/feed/',
    ],
    finance: [
      'https://nairametrics.com/feed/',
      'https://www.proshareng.com/rss/news.xml',
      'https://techeconomy.ng/feed/',
      'https://businessday.ng/feed/',
      'https://www.thisdaylive.com/index.php/category/business/feed/',
    ],
    technology: [
      'https://techcabal.com/feed/',
      'https://techpoint.africa/feed/',
      'https://technext24.com/feed/',
      'https://www.techuncode.com/feed/',
      'https://africanews.tech/feed/',
    ],
    health: [
      'https://healthwise.punchng.com/feed/',
      'https://www.vanguardngr.com/category/health/feed/',
      'https://guardian.ng/category/life/health/feed/',
      'https://thenationonlineng.net/category/health/feed/',
    ],
    education: [
      'https://www.vanguardngr.com/category/education/feed/',
      'https://punchng.com/category/education/feed/',
      'https://guardian.ng/category/features/education/feed/',
      'https://thenationonlineng.net/category/education/feed/',
      'https://dailypost.ng/category/education/feed/',
    ],
    politics: [
      'https://www.premiumtimesng.com/category/news/politics/feed/',
      'https://punchng.com/category/politics/feed/',
      'https://guardian.ng/category/news/politics/feed/',
      'https://dailypost.ng/category/politics/feed/',
      'https://www.vanguardngr.com/category/politics/feed/',
    ],
    business: [
      'https://businessday.ng/feed/',
      'https://nairametrics.com/feed/',
      'https://guardian.ng/category/business-services/business/feed/',
      'https://www.vanguardngr.com/category/businesses/feed/',
      'https://www.thisdaylive.com/index.php/category/business/feed/',
    ],
    sports: [
      'https://www.completesports.com/feed/',
      'https://guardian.ng/category/sport/feed/',
      'https://thenationonlineng.net/category/sports/feed/',
      'https://punchng.com/category/sports/feed/',
      'https://www.vanguardngr.com/category/sports/feed/',
    ],
    entertainment: [
      'https://www.bellanaija.com/feed/',
      'https://guardian.ng/category/art-and-life/feed/',
      'https://www.vanguardngr.com/category/entertainment/feed/',
      'https://punchng.com/category/entertainment/feed/',
      'https://thenationonlineng.net/category/entertainment/feed/',
    ],
    realestate: [
      'https://businessday.ng/real-estate/feed/',
      'https://guardian.ng/category/property/feed/',
      'https://www.vanguardngr.com/category/real-estate/feed/',
    ],
    agriculture: [
      'https://guardian.ng/category/agriculture/feed/',
      'https://www.vanguardngr.com/category/agriculture/feed/',
      'https://dailypost.ng/category/agriculture/feed/',
      'https://businessday.ng/agro-allied/feed/',
    ],
    energy: [
      'https://guardian.ng/category/energy/feed/',
      'https://businessday.ng/energy/feed/',
      'https://www.vanguardngr.com/category/energy/feed/',
      'https://nairametrics.com/category/energy/feed/',
    ],
    travel: [
      'https://guardian.ng/category/travel/feed/',
      'https://thenationonlineng.net/category/travel/feed/',
    ],
    religion: [
      'https://dailypost.ng/category/religion/feed/',
      'https://thenationonlineng.net/category/religion/feed/',
    ],
  },

  US: {
    law: [
      'https://www.scotusblog.com/feed/',
      'https://www.lawfaremedia.org/rss.xml',
      'https://abovethelaw.com/feed/',
      'https://legaltimes.typepad.com/blt/atom.xml',
      'https://www.abajournal.com/news/rss',
    ],
    finance: [
      'https://feeds.bloomberg.com/markets/news.rss',
      'https://www.wsj.com/xml/rss/3_7085.xml',
      'https://fortune.com/feed/',
      'https://www.ft.com/?format=rss',
      'https://feeds.reuters.com/reuters/businessNews',
    ],
    technology: [
      'https://techcrunch.com/feed/',
      'https://www.theverge.com/rss/index.xml',
      'https://arstechnica.com/feed/',
      'https://www.wired.com/feed/rss',
      'https://feeds.feedburner.com/venturebeat/SZYF',
    ],
    health: [
      'https://www.statnews.com/feed/',
      'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
      'https://www.healthline.com/rss/news',
      'https://feeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC',
    ],
    education: [
      'https://www.insidehighered.com/rss.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml',
      'https://www.edweek.org/rss.xml',
      'https://chronicle.com/rss',
    ],
    politics: [
      'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
      'https://www.politico.com/rss/politicopicks.xml',
      'https://feeds.washingtonpost.com/rss/politics',
      'https://thehill.com/rss/syndicator/19109/feed/',
    ],
    business: [
      'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
      'https://feeds.reuters.com/reuters/businessNews',
      'https://fortune.com/feed/',
    ],
    sports: [
      'https://www.espn.com/espn/rss/news',
      'https://sports.yahoo.com/rss/',
      'https://www.cbssports.com/rss/headlines/',
    ],
    entertainment: [
      'https://variety.com/feed/',
      'https://deadline.com/feed/',
      'https://www.hollywoodreporter.com/feed/',
      'https://ew.com/feed/',
    ],
    realestate: [
      'https://www.inman.com/feed/',
      'https://www.housingwire.com/feed/',
      'https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml',
    ],
    travel: [
      'https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml',
      'https://www.travelandleisure.com/rss.xml',
      'https://condnast.com/travel/rss',
    ],
    food: [
      'https://feeds.feedburner.com/seriouseats/recipes',
      'https://rss.nytimes.com/services/xml/rss/nyt/DiningandWine.xml',
    ],
    science: [
      'https://feeds.newscientist.com/home',
      'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
      'https://www.scientificamerican.com/platform/syndication/rss/',
    ],
    energy: [
      'https://www.energy.gov/rss.xml',
      'https://www.greentechmedia.com/feeds/news',
      'https://oilprice.com/rss/main',
    ],
    agriculture: [
      'https://www.agweb.com/rss',
      'https://www.farmprogress.com/rss',
    ],
  },

  GB: {
    law: [
      'https://www.theguardian.com/law/rss',
      'https://www.lawgazette.co.uk/rss',
      'https://legalfutures.co.uk/feed',
      'https://ukscblog.com/feed/',
      'https://www.legal500.com/rss/',
    ],
    finance: [
      'https://www.ft.com/?format=rss',
      'https://www.theguardian.com/money/rss',
      'https://www.thisismoney.co.uk/money/rss/index.html',
      'https://moneyweek.com/feed/',
    ],
    technology: [
      'https://feeds.bbci.co.uk/news/technology/rss.xml',
      'https://www.theregister.com/headlines.atom',
      'https://www.wired.co.uk/rss',
      'https://techmonitor.ai/feed',
    ],
    health: [
      'https://feeds.bbci.co.uk/news/health/rss.xml',
      'https://www.theguardian.com/society/health/rss',
      'https://www.pulsetoday.co.uk/feed/',
      'https://www.nursingtimes.net/feed/',
    ],
    education: [
      'https://www.theguardian.com/education/rss',
      'https://www.tes.com/rss',
      'https://wonkhe.com/feed/',
    ],
    politics: [
      'https://www.theguardian.com/politics/rss',
      'https://feeds.skynews.com/feeds/rss/politics.xml',
      'https://feeds.bbci.co.uk/news/politics/rss.xml',
      'https://order-order.com/feed/',
    ],
    business: [
      'https://feeds.bbci.co.uk/news/business/rss.xml',
      'https://www.theguardian.com/business/rss',
      'https://www.cityam.com/feed/',
    ],
    sports: [
      'https://www.theguardian.com/sport/rss',
      'https://feeds.skynews.com/feeds/rss/sports.xml',
      'https://feeds.bbci.co.uk/sport/rss.xml',
    ],
    entertainment: [
      'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
      'https://www.theguardian.com/culture/rss',
      'https://www.standard.co.uk/culture/rss',
    ],
    realestate: [
      'https://www.theguardian.com/money/property/rss',
      'https://www.propertyweek.com/rss',
      'https://www.thisismoney.co.uk/money/mortgageshome/rss/index.html',
    ],
    science: [
      'https://www.theguardian.com/science/rss',
      'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
    ],
    energy: [
      'https://www.theguardian.com/environment/energy/rss',
      'https://www.rechargenews.com/rss',
    ],
  },

  AU: {
    law: [
      'https://www.lawyersweekly.com.au/rss',
      'https://www.thelawyer.com/rss',
      'https://www.abc.net.au/news/topic/law/feed',
    ],
    finance: [
      'https://www.afr.com/rss',
      'https://www.smh.com.au/business/rss',
      'https://www.abc.net.au/news/business/feed',
    ],
    technology: [
      'https://www.itnews.com.au/rss/',
      'https://www.zdnet.com/news/rss.xml',
      'https://www.abc.net.au/news/science-environment/feed',
    ],
    health: [
      'https://www.abc.net.au/news/health/feed',
      'https://www.smh.com.au/healthcare/rss',
      'https://www.healthcareit.com.au/rss/',
    ],
    education: [
      'https://www.abc.net.au/news/education/feed',
      'https://www.smh.com.au/education/rss',
    ],
    politics: [
      'https://www.abc.net.au/news/politics/feed',
      'https://www.smh.com.au/politics/rss',
      'https://www.theaustralian.com.au/national-affairs/rss',
    ],
    business: [
      'https://www.afr.com/rss',
      'https://www.smh.com.au/business/rss',
    ],
    sports: [
      'https://www.abc.net.au/news/sport/feed',
      'https://www.smh.com.au/sport/rss',
      'https://www.foxsports.com.au/rss',
    ],
    entertainment: [
      'https://www.smh.com.au/entertainment/rss',
      'https://www.abc.net.au/news/entertainment/feed',
    ],
    realestate: [
      'https://www.smh.com.au/property/rss',
      'https://www.domain.com.au/news/feed/',
    ],
  },

  CA: {
    law: [
      'https://www.canadianlawyermag.com/rss',
      'https://www.lexology.com/rss/jurisdiction-canada',
      'https://ablawg.ca/feed/',
    ],
    finance: [
      'https://www.theglobeandmail.com/rss/business/',
      'https://financialpost.com/feed/',
      'https://www.bnnbloomberg.ca/rss',
    ],
    technology: [
      'https://www.itworldcanada.com/rss',
      'https://betakit.com/feed/',
      'https://www.thelogic.co/feed/',
    ],
    health: [
      'https://rss.cbc.ca/lineup/health.xml',
      'https://www.theglobeandmail.com/rss/health/',
    ],
    education: [
      'https://rss.cbc.ca/lineup/technology.xml',
      'https://www.universityaffairs.ca/feed/',
    ],
    politics: [
      'https://rss.cbc.ca/lineup/politics.xml',
      'https://www.theglobeandmail.com/rss/politics/',
      'https://ipolitics.ca/feed/',
    ],
    business: [
      'https://www.theglobeandmail.com/rss/business/',
      'https://financialpost.com/feed/',
    ],
    sports: [
      'https://rss.cbc.ca/lineup/sports.xml',
      'https://www.tsn.ca/rss',
    ],
    entertainment: [
      'https://rss.cbc.ca/lineup/arts.xml',
      'https://www.theglobeandmail.com/rss/arts/',
    ],
    realestate: [
      'https://www.theglobeandmail.com/rss/real-estate/',
      'https://financialpost.com/real-estate/feed/',
    ],
  },

  ZA: {
    law: [
      'https://www.dailymaverick.co.za/feed/',
      'https://groundup.org.za/feed/',
      'https://www.legalbrief.co.za/rss/',
    ],
    finance: [
      'https://www.moneyweb.co.za/feed/',
      'https://www.businesslive.co.za/rss/',
      'https://www.fin24.com/rss',
    ],
    technology: [
      'https://mybroadband.co.za/feed/',
      'https://techcentral.co.za/feed/',
      'https://www.itweb.co.za/rss/',
    ],
    health: [
      'https://health-e.org.za/feed/',
      'https://groundup.org.za/feed/',
    ],
    education: [
      'https://www.dailymaverick.co.za/feed/',
      'https://groundup.org.za/feed/',
    ],
    politics: [
      'https://www.dailymaverick.co.za/feed/',
      'https://ewn.co.za/RSS%20Feeds/Latest%20News',
      'https://www.news24.com/rss',
    ],
    business: [
      'https://www.moneyweb.co.za/feed/',
      'https://www.businesslive.co.za/rss/',
    ],
    sports: [
      'https://www.sport24.co.za/rss',
      'https://www.supersport.com/rss',
    ],
    entertainment: [
      'https://www.timeslive.co.za/rss/',
      'https://www.sowetanlive.co.za/rss/',
    ],
  },

  IN: {
    law: [
      'https://www.livelaw.in/rss/',
      'https://barandbench.com/feed/',
      'https://www.scobserver.in/feed/',
      'https://lawbriefs.in/feed/',
      'https://www.verdictum.in/feed/',
    ],
    finance: [
      'https://economictimes.indiatimes.com/rssfeedsdefault.cms',
      'https://www.moneycontrol.com/rss/latestnews.xml',
      'https://www.livemint.com/rss/feed',
      'https://www.businesstoday.in/rss/home',
    ],
    technology: [
      'https://inc42.com/feed/',
      'https://entrackr.com/feed/',
      'https://www.medianama.com/feed/',
      'https://yourstory.com/feed',
    ],
    health: [
      'https://www.thehealthsite.com/feed/',
      'https://health.economictimes.indiatimes.com/rss/topstories',
      'https://www.healthcareradiindia.com/feed/',
    ],
    education: [
      'https://www.thehindu.com/education/feeder/default.rss',
      'https://indianexpress.com/section/education/feed/',
      'https://economictimes.indiatimes.com/industry/services/education/rssfeeds/13357270.cms',
    ],
    politics: [
      'https://feeds.feedburner.com/ndtvnews-top-stories',
      'https://theprint.in/feed/',
      'https://scroll.in/feed',
      'https://www.thehindu.com/news/national/feeder/default.rss',
    ],
    business: [
      'https://economictimes.indiatimes.com/rssfeedsdefault.cms',
      'https://www.livemint.com/rss/feed',
      'https://www.businesstoday.in/rss/home',
    ],
    sports: [
      'https://www.espncricinfo.com/rss/content/story/feeds/0.xml',
      'https://sports.ndtv.com/rss/all',
      'https://indianexpress.com/section/sports/feed/',
    ],
    entertainment: [
      'https://indianexpress.com/section/entertainment/feed/',
      'https://www.bollywoodhungama.com/rss/',
      'https://www.filmfare.com/rss/',
    ],
    realestate: [
      'https://economictimes.indiatimes.com/industry/services/property-/-cstruction/rssfeeds/13357464.cms',
      'https://www.99acres.com/blog/feed',
    ],
    agriculture: [
      'https://www.thehindu.com/sci-tech/agriculture/feeder/default.rss',
      'https://krishijagran.com/feed/',
    ],
  },
};

// ─── Generic topic feeds (international, used when country-specific unavailable) ─
export const TOPIC_REGISTRY: Record<string, string[]> = {
  law: [
    'https://www.theguardian.com/law/rss',
    'https://www.lawfaremedia.org/rss.xml',
    'https://abovethelaw.com/feed/',
  ],
  finance: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
    'https://www.ft.com/?format=rss',
  ],
  technology: [
    'https://feeds.bbci.co.uk/news/technology/rss.xml',
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
  ],
  health: [
    'https://feeds.bbci.co.uk/news/health/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Health.xml',
    'https://www.theguardian.com/society/rss',
  ],
  education: [
    'https://feeds.bbci.co.uk/news/education/rss.xml',
    'https://www.theguardian.com/education/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/Education.xml',
  ],
  politics: [
    'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
    'https://www.theguardian.com/politics/rss',
  ],
  business: [
    'https://feeds.bbci.co.uk/news/business/rss.xml',
    'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml',
  ],
  sports: [
    'https://feeds.bbci.co.uk/sport/rss.xml',
    'https://www.theguardian.com/sport/rss',
    'https://www.espn.com/espn/rss/news',
  ],
  entertainment: [
    'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml',
    'https://variety.com/feed/',
  ],
  realestate: [
    'https://www.theguardian.com/money/property/rss',
    'https://rss.nytimes.com/services/xml/rss/nyt/RealEstate.xml',
  ],
  science: [
    'https://feeds.newscientist.com/home',
    'https://rss.nytimes.com/services/xml/rss/nyt/Science.xml',
    'https://www.scientificamerican.com/platform/syndication/rss/',
  ],
  travel: [
    'https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml',
    'https://www.theguardian.com/travel/rss',
  ],
  food: [
    'https://feeds.feedburner.com/seriouseats/recipes',
    'https://rss.nytimes.com/services/xml/rss/nyt/DiningandWine.xml',
  ],
  energy: [
    'https://oilprice.com/rss/main',
    'https://www.theguardian.com/environment/energy/rss',
  ],
  agriculture: [
    'https://www.theguardian.com/environment/food/rss',
    'https://www.agweb.com/rss',
  ],
  religion: [
    'https://www.theguardian.com/world/religion/rss',
    'https://religionnews.com/feed/',
  ],
};

// ─── Google News section feeds (topic-level, not country-scoped) ──────────────
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

// ─── Topic aliases — maps any user niche/keyword to a canonical topic key ─────
// Add new aliases here when users configure unusual niche names.
export const TOPIC_ALIASES: Record<string, string> = {
  // law
  'law': 'law', 'legal': 'law', 'court': 'law', 'crime': 'law', 'justice': 'law',
  'attorney': 'law', 'lawyer': 'law', 'litigation': 'law', 'judiciary': 'law',
  // finance
  'finance': 'finance', 'financial': 'finance', 'money': 'finance', 'economy': 'finance',
  'investment': 'finance', 'crypto': 'finance', 'banking': 'finance', 'forex': 'finance',
  'fintech': 'finance', 'stocks': 'finance', 'trading': 'finance', 'insurance': 'finance',
  // technology
  'technology': 'technology', 'tech': 'technology', 'software': 'technology',
  'ai': 'technology', 'startup': 'technology', 'cybersecurity': 'technology',
  'gadgets': 'technology', 'programming': 'technology',
  // health
  'health': 'health', 'medical': 'health', 'wellness': 'health', 'fitness': 'health',
  'medicine': 'health', 'hospital': 'health', 'pharma': 'health', 'nutrition': 'health',
  'mental health': 'health', 'healthcare': 'health',
  // education
  'education': 'education', 'school': 'education', 'academic': 'education',
  'learning': 'education', 'exam': 'education', 'university': 'education',
  'student': 'education', 'curriculum': 'education', 'teacher': 'education',
  // politics
  'politics': 'politics', 'political': 'politics', 'government': 'politics',
  'election': 'politics', 'policy': 'politics', 'parliament': 'politics',
  'senate': 'politics', 'democracy': 'politics',
  // business
  'business': 'business', 'commerce': 'business', 'entrepreneurship': 'business',
  'marketing': 'business', 'ecommerce': 'business', 'retail': 'business',
  'supply chain': 'business', 'logistics': 'business',
  // sports
  'sports': 'sports', 'sport': 'sports', 'football': 'sports', 'basketball': 'sports',
  'cricket': 'sports', 'tennis': 'sports', 'athletics': 'sports', 'soccer': 'sports',
  // entertainment
  'entertainment': 'entertainment', 'music': 'entertainment', 'movies': 'entertainment',
  'film': 'entertainment', 'celebrity': 'entertainment', 'tv': 'entertainment',
  'streaming': 'entertainment', 'gaming': 'entertainment',
  // real estate
  'realestate': 'realestate', 'real estate': 'realestate', 'property': 'realestate',
  'housing': 'realestate', 'mortgage': 'realestate', 'construction': 'realestate',
  // science
  'science': 'science', 'research': 'science', 'climate': 'science',
  'environment': 'science', 'space': 'science', 'biology': 'science',
  // travel
  'travel': 'travel', 'tourism': 'travel', 'hospitality': 'travel', 'aviation': 'travel',
  // food
  'food': 'food', 'cooking': 'food', 'recipe': 'food', 'restaurant': 'food', 'culinary': 'food',
  // energy
  'energy': 'energy', 'oil': 'energy', 'gas': 'energy', 'renewable': 'energy',
  'solar': 'energy', 'electricity': 'energy', 'power': 'energy',
  // agriculture
  'agriculture': 'agriculture', 'farming': 'agriculture', 'agric': 'agriculture',
  'crops': 'agriculture', 'livestock': 'agriculture', 'agribusiness': 'agriculture',
  // religion
  'religion': 'religion', 'faith': 'religion', 'church': 'religion',
  'islam': 'religion', 'christianity': 'religion', 'mosque': 'religion',
};
