import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as TwitterStrategy } from 'passport-twitter';
import User, { IUser } from '../models/user.model';
import { env } from './env';
import logger from './logger';

// ========================================
// GOOGLE OAUTH STRATEGY
// ========================================
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  logger.warn('Google OAuth credentials are not defined in .env. Google login will be disabled.');
} else {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL || `${env.PRODUCTION_URL || 'http://localhost:5000'}/api/auth/google/callback`,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          let user = await User.findOne({ googleId: profile.id });
          if (user) {
            return done(null, user);
          }

          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email found in Google profile'), undefined);
          }

          const existingUser = await User.findOne({ email: email });

          if (existingUser) {
            existingUser.googleId = profile.id;
            existingUser.emailVerified = true;
            await existingUser.save();
            logger.info(`Google ID linked to existing user: ${email}`);
            return done(null, existingUser);
          }

          const newUser = new User({
            googleId: profile.id,
            name: profile.displayName,
            email: email,
            emailVerified: true,
            status: 'active',
            role: 'user',
            wordCredits: env.DEFAULT_FREE_WORD_CREDITS || 1000,
            credits: 10,
          });

          await newUser.save();
          logger.info(`New user created via Google: ${email}`);
          return done(null, newUser);
        } catch (error) {
          logger.error('Error in Google OAuth strategy:', error);
          return done(error as Error, undefined);
        }
      }
    )
  );
}

// ========================================
// TWITTER OAUTH STRATEGY
// ========================================
if (!env.TWITTER_CONSUMER_KEY || !env.TWITTER_CONSUMER_SECRET) {
  logger.warn('Twitter OAuth credentials are not defined in .env. Twitter login will be disabled.');
} else {
  passport.use(
    new TwitterStrategy(
      {
        consumerKey: env.TWITTER_CONSUMER_KEY,
        consumerSecret: env.TWITTER_CONSUMER_SECRET,
        callbackURL: env.TWITTER_CALLBACK_URL || `${env.PRODUCTION_URL || 'http://localhost:5000'}/api/auth/twitter/callback`,
        includeEmail: true,
      },
      async (token, tokenSecret, profile, done) => {
        try {
          let user = await User.findOne({ twitterId: profile.id });
          if (user) {
            return done(null, user);
          }

          const email = profile.emails?.[0]?.value;

          if (email) {
            const existingUser = await User.findOne({ email: email });

            if (existingUser) {
              existingUser.twitterId = profile.id;
              existingUser.twitterUsername = profile.username;
              existingUser.emailVerified = true;
              await existingUser.save();
              logger.info(`Twitter ID linked to existing user: ${email}`);
              return done(null, existingUser);
            }
          }

          const newUser = new User({
            twitterId: profile.id,
            twitterUsername: profile.username,
            name: profile.displayName || profile.username,
            email: email || `${profile.username}@twitter-temp.local`,
            emailVerified: !!email,
            status: 'active',
            role: 'user',
            wordCredits: env.DEFAULT_FREE_WORD_CREDITS || 1000,
            credits: 10,
          });

          await newUser.save();
          logger.info(`New user created via Twitter: ${email || profile.username}`);
          return done(null, newUser);
        } catch (error) {
          logger.error('Error in Twitter OAuth strategy:', error);
          return done(error as Error, undefined);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => {
  done(null, (user as IUser).id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;