'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  MapPin,
  Sparkles,
  CalendarCheck,
  ShieldCheck,
  ScanFace,
  Lock,
  Star,
  ArrowRight,
  Globe,
  Home,
} from 'lucide-react';
import './landing.css';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const GUIDES = [
  {
    name: 'Sofia Martinez',
    location: 'Barcelona, Spain',
    rating: 4.9,
    reviews: 127,
    specialty: 'Architecture & Food Tours',
    img: '/guides/sofia.png',
  },
  {
    name: 'Kenji Tanaka',
    location: 'Tokyo, Japan',
    rating: 5,
    reviews: 203,
    specialty: 'Cultural Experiences',
    img: '/guides/kenji.png',
  },
  {
    name: 'Mei Chen',
    location: 'Singapore',
    rating: 4.8,
    reviews: 89,
    specialty: 'Culinary Adventures',
    img: '/guides/mei.png',
  },
  {
    name: 'Isabella Costa',
    location: 'Rio de Janeiro, Brazil',
    rating: 4.9,
    reviews: 156,
    specialty: 'Adventure & Nature',
    img: '/guides/isabella.png',
  },
  {
    name: 'Kwame Osei',
    location: 'Cape Town, South Africa',
    rating: 5,
    reviews: 174,
    specialty: 'Wildlife & History',
    img: '/guides/kwame.png',
  },
  {
    name: 'Omar Hassan',
    location: 'Marrakech, Morocco',
    rating: 4.9,
    reviews: 142,
    specialty: 'Markets & Traditions',
    img: '/guides/omar.png',
  },
] as const;

const TRUST_ITEMS = [
  {
    icon: ShieldCheck,
    title: 'Verified Local Guides',
    desc: 'Every guide is vetted and locally based',
  },
  {
    icon: ScanFace,
    title: 'Background Checks',
    desc: 'Comprehensive screening for your safety',
  },
  {
    icon: Lock,
    title: 'Secure Payments',
    desc: 'Bank-level encryption and protection',
  },
  {
    icon: Star,
    title: 'Transparent Reviews',
    desc: 'Real feedback from real travelers',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Scroll-reveal hook                                                 */
/* ------------------------------------------------------------------ */

function useReveal() {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const addRef = (el: HTMLElement | null) => {
    if (el && !refs.current.includes(el)) refs.current.push(el);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return addRef;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const reveal = useReveal();

  return (
    <div style={{ marginTop: '-4rem' }}>
      {/* ===== HERO ===== */}
      <section className="landing-hero">
        <div className="landing-hero-orb landing-hero-orb--1" />
        <div className="landing-hero-orb landing-hero-orb--2" />
        <div className="landing-hero-orb landing-hero-orb--3" />

        <div className="landing-hero-content">
          <h1>
            Travel with someone who{' '}
            <span className="accent">actually lives there.</span>
          </h1>

          <p className="landing-hero-subtitle">
            AI-powered trip planning meets local expertise. Get personalized
            itineraries, then book authentic experiences with verified local
            guides.
          </p>

          <div className="landing-hero-ctas">
            <Link href="/trips" className="landing-btn landing-btn--primary">
              <Globe size={18} />
              Start Planning
            </Link>
            <Link
              href="/become-host"
              className="landing-btn landing-btn--ghost"
            >
              Become a Guide
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Stats bar */}
        <div className="landing-stats">
          <div className="landing-stat">
            <div className="landing-stat-value">50K+</div>
            <div className="landing-stat-label">Verified Guides</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-value">130+</div>
            <div className="landing-stat-label">Countries</div>
          </div>
          <div className="landing-stat">
            <div className="landing-stat-value">4.9/5</div>
            <div className="landing-stat-label">Avg Rating</div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="landing-section landing-how-it-works">
        <div className="landing-section-header landing-reveal" ref={reveal}>
          <h2>How It Works</h2>
          <p>Three simple steps to your best trip yet</p>
        </div>

        <div className="landing-steps">
          {[
            {
              icon: MapPin,
              step: 'Step 1',
              title: "Tell us where you're going",
              desc: 'Share your destination, travel dates, and interests.',
            },
            {
              icon: Sparkles,
              step: 'Step 2',
              title: 'Get an AI-crafted itinerary',
              desc: 'Receive a personalized plan tailored to your preferences.',
            },
            {
              icon: CalendarCheck,
              step: 'Step 3',
              title: 'Add local experiences',
              desc: 'Browse and book authentic activities with verified guides.',
            },
          ].map((s) => (
            <div
              key={s.step}
              className="landing-step landing-reveal"
              ref={reveal}
            >
              <div className="landing-step-icon">
                <s.icon />
              </div>
              <div className="landing-step-number">{s.step}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== TRUST & SAFETY ===== */}
      <section className="landing-section landing-trust">
        <div className="landing-trust-grid">
          {TRUST_ITEMS.map((t) => (
            <div
              key={t.title}
              className="landing-trust-card landing-reveal"
              ref={reveal}
            >
              <div className="landing-trust-icon">
                <t.icon />
              </div>
              <h3>{t.title}</h3>
              <p>{t.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURED GUIDES ===== */}
      <section className="landing-section landing-guides">
        <div className="landing-section-header landing-reveal" ref={reveal}>
          <h2>Featured guides</h2>
          <p>Meet some of the experts ready to show you their world</p>
        </div>

        <div className="landing-guides-grid">
          {GUIDES.map((g) => (
            <div
              key={g.name}
              className="landing-guide-card landing-reveal"
              ref={reveal}
            >
              <Image
                src={g.img}
                alt={g.name}
                width={400}
                height={280}
                className="landing-guide-img"
              />
              <div className="landing-guide-body">
                <div className="landing-guide-name">{g.name}</div>
                <div className="landing-guide-location">{g.location}</div>
                <div className="landing-guide-rating">
                  <Star />
                  <strong>{g.rating}</strong>
                  <span>({g.reviews} reviews)</span>
                </div>
                <div className="landing-guide-specialty">{g.specialty}</div>
                <Link href="/become-host" className="landing-guide-btn">
                  View Profile
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="landing-final-cta">
        <h2>Ready to explore differently?</h2>
        <p>
          Join thousands of travelers discovering authentic experiences with
          local guides worldwide.
        </p>
        <Link
          href="/trips"
          className="landing-btn landing-btn--primary landing-btn--cta-large"
        >
          Start Planning
        </Link>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="landing-footer">
        <div className="landing-footer-content">
          <div className="landing-footer-brand">
            <div className="brand-name">
              <Home
                size={20}
                style={{
                  display: 'inline',
                  verticalAlign: 'text-bottom',
                  marginRight: 6,
                  color: 'var(--princeton-orange)',
                }}
              />
              Localhost
            </div>
            <p>
              Connecting travelers with authentic local experiences worldwide.
            </p>
          </div>

          <div>
            <h4>Travelers</h4>
            <ul>
              <li>
                <a href="#how-it-works">How it works</a>
              </li>
              <li>
                <Link href="/trips">Find guides</Link>
              </li>
              <li>
                <a href="#trust">Safety &amp; trust</a>
              </li>
            </ul>
          </div>

          <div>
            <h4>Guides</h4>
            <ul>
              <li>
                <Link href="/become-host">Become a guide</Link>
              </li>
              <li>
                <Link href="/experiences">Guide resources</Link>
              </li>
              <li>
                <a href="#">Success stories</a>
              </li>
            </ul>
          </div>

          <div>
            <h4>Company</h4>
            <ul>
              <li>
                <a href="#">About us</a>
              </li>
              <li>
                <a href="#">Careers</a>
              </li>
              <li>
                <a href="#">Contact</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="landing-footer-bottom">
          <span>&copy; 2026 Localhost. All rights reserved.</span>
          <div className="landing-footer-bottom-links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Cookies</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
