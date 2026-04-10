const LANDING_PAGE_HTML = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Visual Pro Media - AI Instagram Automation</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300&family=Instrument+Sans:wght@400;500;600&family=Bebas+Neue&display=swap\" rel=\"stylesheet\">\n<style>\n*{margin:0;padding:0;box-sizing:border-box}\n:root{--ink:#060810;--ink2:#0c1019;--gold:#c9a84c;--gold2:#e8c97a;--gdim:rgba(201,168,76,0.1);--gline:rgba(201,168,76,0.2);--w:#f0ece4;--w2:#a8a49c;--w3:#5c5852;--w4:#252320;--green:#2ecc8a;--red:#e05050}\nhtml{scroll-behavior:smooth}\nbody{font-family:'Instrument Sans',sans-serif;background:var(--ink);color:var(--w);overflow-x:hidden}\n\n/* NAV */\nnav{position:fixed;top:0;left:0;right:0;z-index:500;padding:22px 56px;display:flex;align-items:center;justify-content:space-between;transition:all 0.4s}\nnav.scrolled{padding:14px 56px;background:rgba(6,8,16,0.96);backdrop-filter:blur(20px);border-bottom:1px solid var(--w4)}\n.logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:19px;letter-spacing:5px;text-transform:uppercase}\n.logo span{color:var(--gold)}\n.nav-links{display:flex;gap:36px}\n.nav-links a{font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--w3);text-decoration:none;transition:color 0.3s}\n.nav-links a:hover{color:var(--gold)}\n.nav-btn{font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--ink);background:var(--gold);border:none;padding:12px 28px;text-decoration:none;transition:all 0.3s;cursor:pointer}\n.nav-btn:hover{background:var(--gold2)}\n\n/* HERO */\n.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:150px 24px 80px;position:relative;overflow:hidden}\n.hero-bg{position:absolute;inset:0;background-image:linear-gradient(rgba(201,168,76,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.03) 1px,transparent 1px);background-size:70px 70px;animation:bgMove 22s linear infinite}\n@keyframes bgMove{0%{transform:translateY(0)}100%{transform:translateY(70px)}}\n.hero-glow{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);width:900px;height:500px;background:radial-gradient(ellipse,rgba(201,168,76,0.07) 0%,transparent 65%);pointer-events:none}\n.tag{position:relative;z-index:1;display:inline-flex;align-items:center;gap:12px;font-size:11px;font-weight:500;letter-spacing:4px;text-transform:uppercase;color:var(--gold);margin-bottom:36px;animation:up 0.8s ease both}\n.tag::before,.tag::after{content:'';width:32px;height:1px;background:var(--gline)}\n.hero h1{position:relative;z-index:1;font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:clamp(54px,9vw,108px);line-height:0.95;letter-spacing:-3px;margin-bottom:8px;animation:up 0.8s 0.1s ease both}\n.hero h1 strong{font-style:normal;font-weight:600;display:block}\n.hero h1 em{color:var(--gold)}\n.hero-sub{position:relative;z-index:1;font-size:17px;color:var(--w2);max-width:500px;line-height:1.85;margin:28px auto 52px;animation:up 0.8s 0.2s ease both}\n.hero-btns{position:relative;z-index:1;display:flex;gap:16px;justify-content:center;flex-wrap:wrap;animation:up 0.8s 0.3s ease both}\n.btn-g{background:var(--gold);color:var(--ink);border:none;padding:18px 44px;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:all 0.3s}\n.btn-g:hover{background:var(--gold2);transform:translateY(-2px)}\n.btn-o{background:transparent;color:var(--w2);border:1px solid var(--w4);padding:18px 44px;font-family:'Instrument Sans',sans-serif;font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;text-decoration:none;transition:all 0.3s}\n.btn-o:hover{border-color:var(--gline);color:var(--gold)}\n.stats{position:relative;z-index:1;display:flex;margin-top:72px;border:1px solid var(--w4);overflow:hidden;animation:up 0.8s 0.4s ease both}\n.stat{padding:22px 48px;text-align:center;border-right:1px solid var(--w4)}\n.stat:last-child{border-right:none}\n.stat-v{font-family:'Bebas Neue',sans-serif;font-size:42px;letter-spacing:2px;color:var(--gold);line-height:1}\n.stat-l{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--w3);margin-top:6px}\n@keyframes up{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}\n\n/* MARQUEE */\n.marquee{border-top:1px solid var(--w4);border-bottom:1px solid var(--w4);padding:15px 0;overflow:hidden;background:var(--ink2)}\n.m-track{display:flex;white-space:nowrap;animation:marquee 26s linear infinite}\n.m-item{font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:4px;color:var(--w4);padding:0 32px;border-right:1px solid var(--w4)}\n.m-item.g{color:var(--gold)}\n@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}\n\n/* SECTIONS */\n.sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n.eyebrow{font-size:11px;font-weight:500;letter-spacing:4px;text-transform:uppercase;color:var(--gold);display:flex;align-items:center;gap:14px;margin-bottom:24px}\n.eyebrow::after{content:'';width:44px;height:1px;background:var(--gline)}\n.sec h2{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:clamp(40px,5vw,68px);line-height:1.02;letter-spacing:-2px;margin-bottom:20px}\n.sec h2 em{color:var(--gold);font-style:italic}\n.sec-sub{font-size:16px;color:var(--w2);line-height:1.85;max-width:500px}\n\n/* HOW IT WORKS */\n.how-grid{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:start;margin-top:64px}\n.steps{display:flex;flex-direction:column}\n.step{display:flex;gap:24px;padding:28px 0;border-bottom:1px solid var(--w4)}\n.step:first-child{padding-top:0}.step:last-child{border-bottom:none}\n.sn{font-family:'Bebas Neue',sans-serif;font-size:48px;color:var(--w4);line-height:1;min-width:44px;transition:color 0.3s}\n.step:hover .sn{color:var(--gold)}\n.st strong{display:block;font-size:16px;font-weight:600;margin-bottom:5px}\n.st span{font-size:14px;color:var(--w3);line-height:1.8}\n\n/* Phone mockup */\n.phone-box{position:sticky;top:120px}\n.phone{background:var(--ink3);border:1px solid rgba(255,255,255,0.07);border-radius:36px;padding:24px;max-width:300px;margin:0 auto;box-shadow:0 48px 96px rgba(0,0,0,0.5)}\n.p-notch{width:80px;height:22px;background:var(--ink2);border-radius:0 0 14px 14px;margin:0 auto 20px}\n.p-head{display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:14px}\n.p-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#8b6914);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:600;color:var(--ink)}\n.p-nm{font-size:12px;font-weight:600}\n.p-st{font-size:10px;color:var(--green);margin-top:1px}\n.msgs{display:flex;flex-direction:column;gap:8px}\n.msg{padding:9px 13px;border-radius:14px;font-size:11px;line-height:1.5;max-width:88%}\n.msg-in{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-bottom-left-radius:4px}\n.msg-out{background:var(--gold);color:var(--ink);font-weight:600;border-bottom-right-radius:4px;align-self:flex-end}\n.msg-img{width:100%;height:100px;background:linear-gradient(135deg,#1a1f2e,#0f1420);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:6px}\n.tdots{display:flex;gap:3px;padding:2px 0}\n.td{width:5px;height:5px;border-radius:50%;background:var(--w3);animation:td 1.2s infinite}\n.td:nth-child(2){animation-delay:0.2s}.td:nth-child(3){animation-delay:0.4s}\n@keyframes td{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}\n.app-bar{background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.18);border-radius:8px;padding:8px 10px;font-size:10px;color:var(--green);margin-top:3px}\n\n/* FEATURES */\n.feat-sec{background:var(--ink2);border-top:1px solid var(--w4);border-bottom:1px solid var(--w4)}\n.feat-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--w4);margin-top:64px}\n.fc{padding:40px 36px;border-right:1px solid var(--w4);border-bottom:1px solid var(--w4);transition:background 0.3s;cursor:default}\n.fc:hover{background:rgba(201,168,76,0.02)}\n.fc:nth-child(3n){border-right:none}\n.fc:nth-child(n+4){border-bottom:none}\n.fc-n{font-family:'Bebas Neue',sans-serif;font-size:56px;color:var(--w4);line-height:1;margin-bottom:18px;transition:color 0.3s}\n.fc:hover .fc-n{color:var(--gold)}\n.fc-t{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;margin-bottom:10px}\n.fc-d{font-size:14px;color:var(--w3);line-height:1.8}\n\n/* RESULTS / CASE STUDY */\n.results-sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n.results-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--w4);margin-top:64px;border:1px solid var(--w4)}\n.result-card{background:var(--ink2);padding:40px 36px}\n.result-num{font-family:'Bebas Neue',sans-serif;font-size:72px;letter-spacing:-2px;color:var(--gold);line-height:1;margin-bottom:8px}\n.result-label{font-size:14px;font-weight:600;margin-bottom:8px}\n.result-desc{font-size:13px;color:var(--w3);line-height:1.7}\n.result-handle{font-size:12px;color:var(--gold);margin-top:16px;letter-spacing:1px}\n\n/* TESTIMONIALS */\n.testi-sec{background:var(--ink2);border-top:1px solid var(--w4);border-bottom:1px solid var(--w4);padding:120px 60px}\n.testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;background:var(--w4);margin-top:64px}\n.tc{background:var(--ink2);padding:44px 36px}\n.tc-stars{color:var(--gold);font-size:13px;letter-spacing:3px;margin-bottom:20px}\n.tc-q{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:300;font-style:italic;line-height:1.75;color:var(--w2);margin-bottom:32px}\n.tc-auth{display:flex;align-items:center;gap:12px}\n.tc-av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--gold),#7a5c10);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:var(--ink)}\n.tc-name{font-size:14px;font-weight:600}\n.tc-handle{font-size:12px;color:var(--w3);margin-top:2px}\n\n/* PRICING */\n.price-sec{padding:120px 60px;max-width:1200px;margin:0 auto}\n\n/* TIMER */\n.timer-wrap{background:rgba(224,80,80,0.05);border:1px solid rgba(224,80,80,0.2);padding:22px 36px;display:flex;align-items:center;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:56px}\n.t-label{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--red);font-weight:600;display:flex;align-items:center;gap:8px}\n.t-digits{display:flex;align-items:center;gap:8px}\n.t-dig{font-family:'Bebas Neue',sans-serif;font-size:44px;letter-spacing:2px;color:var(--red);background:rgba(224,80,80,0.08);border:1px solid rgba(224,80,80,0.15);padding:8px 18px;min-width:68px;text-align:center;line-height:1}\n.t-sep{font-family:'Bebas Neue',sans-serif;font-size:36px;color:var(--red);opacity:0.5}\n.t-note{font-size:12px;color:var(--w3);letter-spacing:1px}\n\n/* PLANS */\n.plans{display:grid;grid-template-columns:1fr 1fr;gap:2px;background:var(--w4);border:1px solid var(--w4)}\n.plan{background:var(--ink);padding:52px 48px;position:relative}\n.plan.feat{background:var(--ink2)}\n.best-tag{position:absolute;top:0;right:0;background:var(--gold);color:var(--ink);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:8px 20px}\n.plan-tag{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--w3);display:block;margin-bottom:24px}\n.plan.feat .plan-tag{color:var(--gold)}\n.plan-orig{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:300;color:var(--w4);text-decoration:line-through;text-decoration-color:var(--red);margin-bottom:4px}\n.plan-price{font-family:'Bebas Neue',sans-serif;font-size:84px;letter-spacing:-2px;line-height:1;margin-bottom:4px}\n.plan-price sup{font-size:38px;letter-spacing:0;vertical-align:super}\n.plan.feat .plan-price{color:var(--gold)}\n.plan-period{font-size:13px;color:var(--w3);letter-spacing:1px;margin-bottom:10px}\n.plan-save{display:inline-flex;align-items:center;gap:6px;background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.2);color:var(--green);padding:4px 14px;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:36px}\n.plan-div{height:1px;background:var(--w4);margin-bottom:32px}\n.plan-feats{list-style:none;display:flex;flex-direction:column;gap:14px;margin-bottom:40px}\n.pf{display:flex;align-items:flex-start;gap:12px;font-size:14px;color:var(--w2);line-height:1.5}\n.pfc{width:18px;height:18px;flex-shrink:0;border:1px solid var(--gline);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--gold);margin-top:2px}\n.plan.feat .pfc{background:var(--gdim)}\n.btn-plan{display:block;text-align:center;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;padding:18px;cursor:pointer;transition:all 0.3s}\n.btn-ol{border:1px solid var(--w4);color:var(--w3);background:transparent}\n.btn-ol:hover{border-color:var(--gline);color:var(--gold)}\n.btn-gl{background:var(--gold);color:var(--ink);border:none}\n.btn-gl:hover{background:var(--gold2);box-shadow:0 12px 40px rgba(201,168,76,0.25)}\n.plan-note{font-size:11px;color:var(--w3);text-align:center;margin-top:12px;letter-spacing:0.5px}\n.expired-box{display:none;background:rgba(224,80,80,0.07);border:1px solid rgba(224,80,80,0.2);padding:16px;margin-top:16px;text-align:center;color:var(--red);font-size:13px;letter-spacing:1px}\n\n/* FAQ */\n.faq-sec{padding:120px 60px;max-width:760px;margin:0 auto}\n.faq-item{border-bottom:1px solid var(--w4)}\n.faq-q{display:flex;justify-content:space-between;align-items:center;padding:26px 0;cursor:pointer;font-size:16px;font-weight:500;transition:color 0.3s}\n.faq-q:hover{color:var(--gold)}\n.faq-icon{width:26px;height:26px;border:1px solid var(--w4);display:flex;align-items:center;justify-content:center;font-size:17px;color:var(--w3);flex-shrink:0;transition:all 0.3s}\n.faq-item.open .faq-icon{background:var(--gdim);border-color:var(--gline);color:var(--gold);transform:rotate(45deg)}\n.faq-a{max-height:0;overflow:hidden;font-size:15px;color:var(--w3);line-height:1.9;transition:max-height 0.4s ease,padding 0.4s}\n.faq-item.open .faq-a{max-height:200px;padding-bottom:26px}\n\n/* CONTACT */\n.contact-sec{padding:60px;border-top:1px solid var(--w4);display:flex;align-items:center;justify-content:center}\n.contact-box{display:flex;align-items:center;border:1px solid var(--w4);overflow:hidden}\n.c-label{padding:22px 28px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--w3);background:var(--ink2);border-right:1px solid var(--w4)}\n.c-link{display:flex;align-items:center;gap:12px;padding:22px 32px;font-size:14px;color:var(--w2);text-decoration:none;border-right:1px solid var(--w4);transition:all 0.3s}\n.c-link:last-child{border-right:none}\n.c-link:hover{background:var(--gdim);color:var(--gold)}\n\n/* CTA */\n.cta-sec{padding:160px 60px;text-align:center;position:relative;overflow:hidden;border-top:1px solid var(--w4)}\n.cta-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(201,168,76,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(201,168,76,0.025) 1px,transparent 1px);background-size:60px 60px}\n.cta-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:700px;height:400px;background:radial-gradient(ellipse,rgba(201,168,76,0.07),transparent 60%)}\n.cta-sec h2{position:relative;z-index:1;font-family:'Cormorant Garamond',serif;font-weight:300;font-style:italic;font-size:clamp(44px,7vw,88px);line-height:0.98;letter-spacing:-3px;margin-bottom:24px}\n.cta-sec h2 strong{font-style:normal;font-weight:600;color:var(--gold);display:block}\n.cta-sec p{position:relative;z-index:1;font-size:17px;color:var(--w2);margin-bottom:48px}\n.cta-btns{position:relative;z-index:1;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}\n\n/* FOOTER */\nfooter{padding:36px 60px;border-top:1px solid var(--w4);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}\n.f-logo{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:17px;letter-spacing:4px;text-transform:uppercase}\n.f-logo span{color:var(--gold)}\n.f-links{display:flex;gap:24px;flex-wrap:wrap}\n.f-links a{font-size:11px;color:var(--w3);text-decoration:none;letter-spacing:1px;text-transform:uppercase;transition:color 0.3s}\n.f-links a:hover{color:var(--gold)}\n.f-copy{font-size:11px;color:var(--w4);letter-spacing:1px}\n\n/* REVEAL */\n.reveal{opacity:0;transform:translateY(40px);transition:opacity 0.85s ease,transform 0.85s ease}\n.reveal.visible{opacity:1;transform:translateY(0)}\n\n/* RESPONSIVE */\n@media(max-width:900px){\nnav{padding:16px 20px}nav.scrolled{padding:12px 20px}.nav-links{display:none}\n.hero{padding:120px 20px 60px}.stats{flex-direction:column;gap:1px;background:var(--w4)}\n.stat{border-right:none;border-bottom:1px solid var(--w4);background:var(--ink2)}.stat:last-child{border-bottom:none}\n.sec{padding:80px 20px}.how-grid{grid-template-columns:1fr;gap:40px}.phone-box{position:static}\n.feat-grid{grid-template-columns:1fr}.fc{border-right:none;border-bottom:1px solid var(--w4)}.fc:last-child{border-bottom:none}\n.fc:nth-child(n+4){border-bottom:1px solid var(--w4)}.results-grid{grid-template-columns:1fr}.testi-sec{padding:80px 20px}.testi-grid{grid-template-columns:1fr}\n.price-sec{padding:80px 20px}.plans{grid-template-columns:1fr}.plan{padding:40px 24px}.faq-sec{padding:80px 20px}\n.contact-sec{padding:40px 20px}.contact-box{flex-direction:column;width:100%}.c-link{border-right:none;border-bottom:1px solid var(--w4)}.c-link:last-child{border-bottom:none}\n.cta-sec{padding:100px 20px}footer{padding:28px 20px;flex-direction:column;text-align:center}.f-links{justify-content:center}\n.timer-wrap{gap:12px;padding:16px 20px}.t-dig{font-size:36px;padding:6px 14px;min-width:56px}\n.results-sec{padding:80px 20px}\n}\n</style>\n</head>\n<body>\n\n<nav id=\"nav\">\n  <div class=\"logo\">Visual Pro <span>Media</span></div>\n  <div class=\"nav-links\">\n    <a href=\"#how\">How It Works</a>\n    <a href=\"#features\">Features</a>\n    <a href=\"#results\">Results</a>\n    <a href=\"#pricing\">Pricing</a>\n    <a href=\"#faq\">FAQ</a>\n  </div>\n  <a href=\"#pricing\" class=\"nav-btn\">Get Started</a>\n</nav>\n\n<!-- HERO -->\n<section class=\"hero\">\n  <div class=\"hero-bg\"></div>\n  <div class=\"hero-glow\"></div>\n  <div class=\"tag\">AI-Powered Instagram Automation</div>\n  <h1><em>Grow Your</em><br><strong>Instagram on <em>Autopilot</em></strong></h1>\n  <p class=\"hero-sub\">Type any topic in Telegram. Our AI writes the caption, creates a stunning image, and posts to Instagram automatically \u2014 in under 30 seconds.</p>\n  <div class=\"hero-btns\">\n    <a href=\"#pricing\" class=\"btn-g\">Start for Rs.2,000/month</a>\n    <a href=\"#how\" class=\"btn-o\">See How It Works</a>\n  </div>\n  <div class=\"stats\">\n    <div class=\"stat\"><div class=\"stat-v\">30s</div><div class=\"stat-l\">Post Created In</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">100%</div><div class=\"stat-l\">Automated</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">GPT-4o</div><div class=\"stat-l\">AI Engine</div></div>\n    <div class=\"stat\"><div class=\"stat-v\">24/7</div><div class=\"stat-l\">Always Running</div></div>\n  </div>\n</section>\n\n<!-- MARQUEE -->\n<div class=\"marquee\">\n  <div class=\"m-track\">\n    <span class=\"m-item\">AI Content Creation</span><span class=\"m-item g\">Visual Pro Media</span><span class=\"m-item\">Instagram Automation</span><span class=\"m-item g\">Telegram Control</span><span class=\"m-item\">GPT-4o Powered</span><span class=\"m-item g\">30 Second Posts</span><span class=\"m-item\">Auto Publishing</span><span class=\"m-item g\">Unlimited Posts</span><span class=\"m-item\">Real-time News</span><span class=\"m-item g\">Branded Images</span>\n    <span class=\"m-item\">AI Content Creation</span><span class=\"m-item g\">Visual Pro Media</span><span class=\"m-item\">Instagram Automation</span><span class=\"m-item g\">Telegram Control</span><span class=\"m-item\">GPT-4o Powered</span><span class=\"m-item g\">30 Second Posts</span><span class=\"m-item\">Auto Publishing</span><span class=\"m-item g\">Unlimited Posts</span><span class=\"m-item\">Real-time News</span><span class=\"m-item g\">Branded Images</span>\n  </div>\n</div>\n\n<!-- HOW IT WORKS -->\n<section id=\"how\">\n  <div class=\"sec\">\n    <div class=\"eyebrow\">How It Works</div>\n    <h2>From idea to <em>Instagram</em><br>in four simple steps</h2>\n    <p class=\"sec-sub\">No design tools. No copywriting skills. No scheduling apps. Just Telegram and our AI doing everything for you.</p>\n    <div class=\"how-grid reveal\">\n      <div class=\"steps\">\n        <div class=\"step\"><div class=\"sn\">01</div><div class=\"st\"><strong>Subscribe and Connect</strong><span>Pay once and fill a simple form with your Instagram details. Your AI bot activates automatically in seconds \u2014 no technical knowledge needed.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">02</div><div class=\"st\"><strong>Type Any Topic in Telegram</strong><span>Open Telegram and type anything \u2014 \"AI tools 2026\", \"travel tips India\", \"Monday motivation\". That is literally all you do.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">03</div><div class=\"st\"><strong>AI Creates Everything</strong><span>GPT-4o writes a stunning caption with the perfect hashtags. AI generates a branded image. All ready in about 25 seconds automatically.</span></div></div>\n        <div class=\"step\"><div class=\"sn\">04</div><div class=\"st\"><strong>Approve and Go Live</strong><span>Preview the post right inside Telegram. Just reply \"approve\" and your post is instantly live on Instagram for your audience to see.</span></div></div>\n      </div>\n      <div class=\"phone-box\">\n        <div class=\"phone\">\n          <div class=\"p-notch\"></div>\n          <div class=\"p-head\">\n            <div class=\"p-av\">V</div>\n            <div><div class=\"p-nm\">Your Instagram Bot</div><div class=\"p-st\">Online</div></div>\n          </div>\n          <div class=\"msgs\">\n            <div class=\"msg msg-out\">AI tools 2026</div>\n            <div class=\"msg msg-in\"><div class=\"tdots\"><div class=\"td\"></div><div class=\"td\"></div><div class=\"td\"></div></div></div>\n            <div class=\"msg msg-in\" style=\"max-width:100%\">\n              <div class=\"msg-img\">\ud83c\udfa8</div>\n              <strong style=\"font-size:11px;display:block;margin-bottom:3px\">Post created!</strong>\n              <span style=\"font-size:10px;color:#5c5852\">Top 5 AI tools changing content creation forever...</span>\n            </div>\n            <div class=\"msg msg-in\" style=\"max-width:100%\"><div class=\"app-bar\">Reply <strong>approve</strong> to post or <strong>redo</strong> to regenerate</div></div>\n            <div class=\"msg msg-out\">approve</div>\n            <div class=\"msg msg-in\">Posted to @yourbrand! \ud83d\ude80</div>\n          </div>\n        </div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- FEATURES -->\n<section class=\"feat-sec\" id=\"features\">\n  <div class=\"sec\" style=\"padding-bottom:0\">\n    <div class=\"eyebrow\">Features</div>\n    <h2>Everything to grow your<br><em>Instagram effortlessly</em></h2>\n  </div>\n  <div style=\"padding:0 60px 120px;max-width:1200px;margin:0 auto\">\n    <div class=\"feat-grid reveal\">\n      <div class=\"fc\"><div class=\"fc-n\">01</div><div class=\"fc-t\">GPT-4o Content Engine</div><div class=\"fc-d\">ChatGPT writes captions, hooks, and hashtags perfectly optimized for Instagram reach and engagement every single time without fail.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">02</div><div class=\"fc-t\">Auto Image Generation</div><div class=\"fc-d\">Stunning branded visuals created automatically for every post. Professional quality without needing Canva, Photoshop, or any design skill.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">03</div><div class=\"fc-t\">Telegram Control Panel</div><div class=\"fc-d\">Manage everything from Telegram on your phone. Preview, approve, or regenerate posts anytime \u2014 it takes just a few seconds.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">04</div><div class=\"fc-t\">Real-time Web Search</div><div class=\"fc-d\">Bot searches the web for latest news and trending topics to create posts about current events and viral content automatically.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">05</div><div class=\"fc-t\">30-Second Publishing</div><div class=\"fc-d\">From idea to live on Instagram in under 30 seconds. Post every day without spending time or energy on content creation.</div></div>\n      <div class=\"fc\"><div class=\"fc-n\">06</div><div class=\"fc-t\">Safe and Reliable</div><div class=\"fc-d\">Uses official Instagram API \u2014 same as Buffer and Later. You review every post before it publishes. Your account stays completely safe.</div></div>\n    </div>\n  </div>\n</section>\n\n<!-- RESULTS -->\n<section id=\"results\">\n  <div class=\"results-sec\">\n    <div class=\"eyebrow\">Real Results</div>\n    <h2>Numbers that speak<br><em>for themselves</em></h2>\n    <p class=\"sec-sub\">These are real results from clients using Visual Pro Media's AI automation system every day.</p>\n    <div class=\"results-grid reveal\">\n      <div class=\"result-card\">\n        <div class=\"result-num\">400%</div>\n        <div class=\"result-label\">Follower Growth</div>\n        <div class=\"result-desc\">From 1,200 to 6,000 followers in 2 months by posting daily AI-generated content consistently without any manual effort.</div>\n        <div class=\"result-handle\">@rahul.digital \u2014 Digital Marketing</div>\n      </div>\n      <div class=\"result-card\">\n        <div class=\"result-num\">3hrs</div>\n        <div class=\"result-label\">Saved Every Day</div>\n        <div class=\"result-desc\">Previously spending 3 hours per post on writing, designing, and scheduling. Now the entire process takes 30 seconds flat.</div>\n        <div class=\"result-handle\">@priya.travels \u2014 Travel Creator</div>\n      </div>\n      <div class=\"result-card\">\n        <div class=\"result-num\">5x</div>\n        <div class=\"result-label\">Engagement Increase</div>\n        <div class=\"result-desc\">Engagement rate jumped from 1.2% to 6.8% after switching to consistent daily AI-powered posts with optimized captions and hashtags.</div>\n        <div class=\"result-handle\">@arjun.agency \u2014 Marketing Agency</div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- TESTIMONIALS -->\n<section class=\"testi-sec\">\n  <div style=\"max-width:1200px;margin:0 auto\">\n    <div class=\"eyebrow\">Testimonials</div>\n    <h2>Loved by creators<br><em>across India</em></h2>\n    <div class=\"testi-grid reveal\">\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"I used to spend 3 hours making one post. Now my bot posts twice a day while I sleep. My followers grew 400% in just 2 months. This is the best investment I made for my brand.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">R</div><div><div class=\"tc-name\">Rahul Sharma</div><div class=\"tc-handle\">@rahul.digital \u00b7 Mumbai</div></div></div>\n      </div>\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"Best investment for my travel page. I just type the destination and the bot creates a beautiful post with perfect hashtags. My audience loves the content and engagement is through the roof.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">P</div><div><div class=\"tc-name\">Priya Mehta</div><div class=\"tc-handle\">@priya.travels \u00b7 Delhi</div></div></div>\n      </div>\n      <div class=\"tc\">\n        <div class=\"tc-stars\">\u2605\u2605\u2605\u2605\u2605</div>\n        <div class=\"tc-q\">\"Managing 3 client Instagram accounts was exhausting me. This bot changed everything completely. My clients are thrilled, the results are incredible, and I finally have my weekends back.\"</div>\n        <div class=\"tc-auth\"><div class=\"tc-av\">A</div><div><div class=\"tc-name\">Arjun Patel</div><div class=\"tc-handle\">@arjun.agency \u00b7 Bangalore</div></div></div>\n      </div>\n    </div>\n  </div>\n</section>\n\n<!-- PRICING -->\n<section id=\"pricing\">\n  <div class=\"price-sec\">\n    <div class=\"eyebrow\">Pricing</div>\n    <h2>Simple pricing,<br><em>incredible value</em></h2>\n    <p class=\"sec-sub\" style=\"margin-bottom:56px\">Limited time offer \u2014 discount disappears when the timer hits zero. Lock in your price now!</p>\n\n    <!-- TIMER -->\n    <div class=\"timer-wrap reveal\">\n      <div class=\"t-label\">\ud83d\udd25 Limited Offer Ends In</div>\n      <div class=\"t-digits\">\n        <div class=\"t-dig\" id=\"th\">02</div>\n        <div class=\"t-sep\">:</div>\n        <div class=\"t-dig\" id=\"tm\">00</div>\n        <div class=\"t-sep\">:</div>\n        <div class=\"t-dig\" id=\"ts\">00</div>\n      </div>\n      <div class=\"t-note\">After timer expires \u00b7 original prices restore</div>\n    </div>\n\n    <!-- PLANS -->\n    <div class=\"plans reveal\">\n\n      <!-- MONTHLY -->\n      <div class=\"plan\">\n        <span class=\"plan-tag\">Monthly Plan</span>\n        <div class=\"plan-orig\" id=\"m-orig\">Rs.3,000 / month</div>\n        <div class=\"plan-price\" id=\"m-price\"><sup>Rs.</sup>2000</div>\n        <div class=\"plan-period\">per month \u00b7 cancel anytime</div>\n        <div class=\"plan-save\" id=\"m-save\">33% OFF \u00b7 Save Rs.1,000</div>\n        <div class=\"plan-div\"></div>\n        <ul class=\"plan-feats\">\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Unlimited Instagram posts</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>GPT-4o AI content creation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Auto image generation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Telegram bot control</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Real-time web search</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Priority support</li>\n        </ul>\n        <a href=\"/pay?plan=monthly\" class=\"btn-plan btn-ol\" id=\"m-btn\">Get Monthly Access</a>\n        <div class=\"plan-note\">\ud83d\udd12 Secured by Razorpay</div>\n      </div>\n\n      <!-- 3 MONTH -->\n      <div class=\"plan feat\">\n        <div class=\"best-tag\">Best Value</div>\n        <span class=\"plan-tag\">3 Month Bundle</span>\n        <div class=\"plan-orig\" id=\"q-orig\">Rs.5,000 for 3 months</div>\n        <div class=\"plan-price\" id=\"q-price\"><sup>Rs.</sup>4500</div>\n        <div class=\"plan-period\">for 3 months \u00b7 save Rs.500 vs monthly</div>\n        <div class=\"plan-save\" id=\"q-save\">10% OFF \u00b7 Save Rs.500</div>\n        <div class=\"plan-div\"></div>\n        <ul class=\"plan-feats\">\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Unlimited Instagram posts</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>GPT-4o AI content creation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Auto image generation</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Telegram bot control</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div>Real-time web search</li>\n          <li class=\"pf\"><div class=\"pfc\">\u2713</div><strong>3 months guaranteed access</strong></li>\n        </ul>\n        <a href=\"/pay?plan=quarterly\" class=\"btn-plan btn-gl\" id=\"q-btn\">Get 3 Month Bundle</a>\n        <div class=\"plan-note\">\ud83d\udd12 Secured by Razorpay \u00b7 Best deal</div>\n      </div>\n    </div>\n    <div class=\"expired-box\" id=\"expired-box\">Offer expired \u2014 prices have returned to original rates.</div>\n  </div>\n</section>\n\n<!-- FAQ -->\n<section id=\"faq\">\n  <div class=\"faq-sec\">\n    <div class=\"eyebrow\">FAQ</div>\n    <h2>Questions <em>answered</em></h2>\n    <div style=\"margin-top:56px\">\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Do I need any technical knowledge? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Zero technical knowledge needed. After payment you fill a simple form with your Instagram details. We set everything up. You just open Telegram and start typing topics to post.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Is my Instagram account safe? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">100% safe. We use the official Instagram API \u2014 the same method used by Buffer, Later, and Hootsuite. You review every single post before it publishes. Nothing goes live without your approval.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">How many posts can I create per month? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Unlimited posts! There is absolutely no cap. Post once a day or ten times a day \u2014 your bot is always ready whenever you need it, 24 hours a day, 7 days a week.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">Can I cancel anytime? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">Yes, cancel anytime with no questions asked and no cancellation fees. Just message us on Instagram or email and we cancel your subscription the same day.</div></div>\n      <div class=\"faq-item\"><div class=\"faq-q\" onclick=\"toggleFaq(this.parentElement)\">What if I need help setting up? <div class=\"faq-icon\">+</div></div><div class=\"faq-a\">We provide personal hands-on support via Instagram DM and email. Message us and we will personally walk you through the entire setup within 24 hours. We make sure you are fully live before we leave.</div></div>\n    </div>\n  </div>\n</section>\n\n<!-- CONTACT -->\n<div class=\"contact-sec\">\n  <div class=\"contact-box\">\n    <div class=\"c-label\">Contact and Support</div>\n    <a href=\"https://www.instagram.com/visualpromediaofficial\" target=\"_blank\" class=\"c-link\">\ud83d\udcf8 &nbsp;@visualpromediaofficial</a>\n    <a href=\"/cdn-cgi/l/email-protection#3e44535b5a575f105f570c077e59535f5752105d5153\" class=\"c-link\">\u2709 &nbsp;<span class=\"__cf_email__\" data-cfemail=\"403a2d252429216e2129727900272d21292c6e232f2d\">[email&#160;protected]</span></a>\n  </div>\n</div>\n\n<!-- CTA -->\n<div class=\"cta-sec\">\n  <div class=\"cta-grid\"></div>\n  <div class=\"cta-glow\"></div>\n  <h2>Ready to grow<br><strong>on autopilot?</strong></h2>\n  <p>Join creators and brands posting daily without effort. Setup in 5 minutes.</p>\n  <div class=\"cta-btns\">\n    <a href=\"/pay?plan=quarterly\" class=\"btn-g\">Get 3 Months \u2014 Rs.4,500</a>\n    <a href=\"/pay?plan=monthly\" class=\"btn-o\">Start Monthly \u2014 Rs.2,000</a>\n  </div>\n</div>\n\n<!-- FOOTER -->\n<footer>\n  <div class=\"f-logo\">Visual Pro <span>Media</span></div>\n  <div class=\"f-links\">\n    <a href=\"https://www.instagram.com/visualpromediaofficial\" target=\"_blank\">Instagram</a>\n    <a href=\"/cdn-cgi/l/email-protection#abd1c6cecfc2ca85cac29992ebccc6cac2c785c8c4c6\">Email</a>\n    <a href=\"/privacy\">Privacy</a>\n    <a href=\"/terms\">Terms</a>\n    <a href=\"/data-deletion\">Data Deletion</a>\n  </div>\n  <div class=\"f-copy\">2026 Visual Pro Media. All rights reserved.</div>\n</footer>\n\n<script data-cfasync=\"false\" src=\"/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js\"></script><script>\n// Nav scroll\nwindow.addEventListener('scroll',function(){document.getElementById('nav').classList.toggle('scrolled',window.scrollY>50);});\n\n// FAQ\nfunction toggleFaq(el){var o=el.classList.contains('open');document.querySelectorAll('.faq-item').forEach(function(i){i.classList.remove('open');});if(!o)el.classList.add('open');}\n\n// Timer\n(function(){\n  var KEY='vpm_timer_v5';\n  var end=parseInt(localStorage.getItem(KEY)||'0');\n  if(!end||end<Date.now()){end=Date.now()+2*60*60*1000;localStorage.setItem(KEY,String(end));}\n  function pad(n){return String(n).padStart(2,'0');}\n  function tick(){\n    var diff=end-Date.now();\n    if(diff<=0){\n      document.getElementById('th').textContent='00';\n      document.getElementById('tm').textContent='00';\n      document.getElementById('ts').textContent='00';\n      document.getElementById('m-price').innerHTML='<sup>Rs.</sup>3000';\n      document.getElementById('q-price').innerHTML='<sup>Rs.</sup>5000';\n      document.getElementById('m-save').style.display='none';\n      document.getElementById('q-save').style.display='none';\n      document.getElementById('m-orig').style.display='none';\n      document.getElementById('q-orig').style.display='none';\n      document.getElementById('m-btn').textContent='Get Monthly Access';\n      document.getElementById('q-btn').textContent='Get 3 Month Bundle';\n      document.getElementById('expired-box').style.display='block';\n      return;\n    }\n    var h=Math.floor(diff/3600000);\n    var m=Math.floor((diff%3600000)/60000);\n    var s=Math.floor((diff%60000)/1000);\n    document.getElementById('th').textContent=pad(h);\n    document.getElementById('tm').textContent=pad(m);\n    document.getElementById('ts').textContent=pad(s);\n    setTimeout(tick,1000);\n  }\n  tick();\n})();\n\n// Scroll reveal\nvar obs=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting)e.target.classList.add('visible');});},{threshold:0.08});\ndocument.querySelectorAll('.reveal').forEach(function(el){obs.observe(el);});\n</script>\n</body>\n</html>\n";

const express = require('express');
const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PUBLIC_URL = process.env.PUBLIC_URL || 'https://vpm-bot.onrender.com';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// ── Client Storage ────────────────────────────────────────────
function loadClients() {
  try { return JSON.parse(process.env.CLIENTS_DATA || '{}'); } catch(e) { return {}; }
}
function saveClients(clients) {
  console.log('CLIENTS_DATA_UPDATE:' + JSON.stringify(clients));
}

const imageStore = {};
const sessions = {};
const userTemplates = {};
const userPhotos = {};

// ── Template Configs ──────────────────────────────────────────
const TEMPLATES = {
  'Dark Luxury':  { file: 'templates/dark_luxury.jpg',  emoji: '🖤' },
  'Light Clean':  { file: 'templates/light_clean.jpg',  emoji: '🤍' },
  'X Style':      { file: 'templates/x_style.jpg',      emoji: '✖️' },
  'News Style':   { file: 'templates/news_style.jpg',   emoji: '📰' },
  'Quote Card':   { file: 'templates/quote_card.jpg',   emoji: '💬' },
};
const TEMPLATE_NAMES = Object.keys(TEMPLATES);

const TEMPLATE_CONFIGS = {

  'X Style': {
    // dark_luxury.jpg = dark black/green rounded card
    // Text only - no photo - white headline + green accent + body
    bg: 'dark',
    headline: {
      x: 155, y: 230, maxW: 740,
      color: '#ffffff', size: 44,
      weight: 'bold', font: 'Arial, sans-serif', lineH: 58
    },
    accentLine: { x: 155, y: 420, w: 5, h: 170, color: '#00cc66' },
    body: {
      x: 175, y: 438, maxW: 720,
      color: 'rgba(255,255,255,0.72)',
      size: 23, lineH: 36, font: 'Arial, sans-serif'
    },
    author: { x: 175, y: 760, color: '#00cc66', size: 21 },
    brandName: { x: 540, y: 1005, color: '#ffffff', size: 20, weight: 'bold', align: 'center' },
    handle: { x: 540, y: 1034, color: '#00cc66', size: 18, align: 'center' },
  },

  'Dark Luxury': {
    // light_clean.jpg = cream petal texture background
    // Centered elegant text ONLY - no photo - no accent line
    bg: 'light',
    headline: {
      x: 540, y: 270, maxW: 820,
      color: '#1a1a1a', size: 40,
      weight: '400', italic: true,
      font: 'Georgia, serif', lineH: 58, align: 'center'
    },
    body: {
      x: 540, y: 540, maxW: 760,
      color: '#3a3a3a', size: 23,
      font: 'Georgia, serif', lineH: 36, align: 'center'
    },
    author: {
      x: 540, y: 800, color: '#888888',
      size: 21, italic: true, align: 'center', font: 'Georgia, serif'
    },
    brandName: { x: 540, y: 1000, color: '#2a2a2a', size: 19, weight: 'bold', align: 'center' },
    handle: { x: 540, y: 1030, color: '#888888', size: 16, align: 'center' },
  },

  'Light Clean': {
    // news_style.jpg = white/gray split layout
    // Photo LEFT, text RIGHT - with blue category bar
    bg: 'light',
    splitLayout: true,
    photo: { x: 36, y: 80, w: 456, h: 862, radius: 24 },
    category: { x: 546, y: 114, color: '#ffffff', size: 15, weight: 'bold' },
    headline: {
      x: 538, y: 170, maxW: 500,
      color: '#111111', size: 48,
      weight: 'bold', lineH: 56, uppercase: true
    },
    body: {
      x: 538, y: 500, maxW: 500,
      color: '#333333', size: 21, lineH: 32
    },
    cta: { x: 538, y: 860, color: '#1a3a6b', size: 22, weight: 'bold', text: 'Swipe to know more >' },
    brandName: { x: 36, y: 1045, color: '#111111', size: 21, weight: 'bold' },
    handle: { x: 1044, y: 1045, color: '#111111', size: 21, align: 'right' },
  },

  'News Style': {
    // x_style.jpg = cream/green gradient with pill shapes
    // Centered headline and body text - dark green colors
    bg: 'light',
    headline: {
      x: 540, y: 220, maxW: 840,
      color: '#1a2a0a', size: 46,
      weight: 'bold', lineH: 60, align: 'center'
    },
    body: {
      x: 540, y: 470, maxW: 840,
      color: '#2a3a1a', size: 23,
      lineH: 36, align: 'center'
    },
    author: { x: 540, y: 800, color: '#3a4a2a', size: 20, italic: true, align: 'center' },
    brandName: { x: 40, y: 955, color: '#1a2a0a', size: 19, weight: 'bold' },
    handle: { x: 1040, y: 955, color: '#3a4a2a', size: 19, align: 'right' },
  },

  'Quote Card': {
    // quote_card.jpg = orange/brown bg with rounded border and quote marks
    // Quote text inside box - white text
    bg: 'dark',
    headline: {
      x: 200, y: 310, maxW: 700,
      color: '#ffffff', size: 36,
      weight: '400', lineH: 52, font: 'sans-serif'
    },
    author: { x: 200, y: 720, color: 'rgba(255,255,255,0.85)', size: 24, font: 'sans-serif' },
    brandName: { x: 36, y: 1018, color: '#111111', size: 20, weight: 'bold' },
    handle: { x: 1044, y: 1018, color: '#333333', size: 20, align: 'right' },
  }
};

// ── Template Menu ─────────────────────────────────────────────
async function sendTemplateMenu(botToken, chatId) {
  const buttons = TEMPLATE_NAMES.map(name => [{ text: TEMPLATES[name].emoji + ' ' + name, callback_data: 'template:' + name }]);
  buttons.push([{ text: '📷 Upload My Own Photo', callback_data: 'template:custom' }]);
  await axios.post('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    chat_id: chatId,
    text: '🎨 *Choose Your Template Style*\n\nSelect a template for your posts. Change anytime with /template',
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

async function getTemplateBuffer(templateName) {
  try {
    const t = TEMPLATES[templateName];
    if (t && fs.existsSync(t.file)) return fs.readFileSync(t.file);
  } catch(e) { console.log('Template load error:', e.message); }
  return null;
}

// ── Helper Functions ──────────────────────────────────────────
function wrapLines(ctx, text, maxW) {
  const words = (text||'').split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawZoneText(ctx, zone, text) {
  if (!zone || !text) return zone ? zone.y : 0;
  const weight = zone.weight || 'normal';
  const italic = zone.italic ? 'italic ' : '';
  ctx.font = italic + weight + ' ' + (zone.size || 28) + 'px ' + (zone.font || 'sans-serif');
  ctx.fillStyle = zone.color || '#ffffff';
  ctx.textAlign = zone.align || 'left';
  const display = zone.uppercase ? text.toUpperCase() : text;
  const lines = wrapLines(ctx, display, zone.maxW || 700);
  const lh = zone.lineH || (zone.size || 28) * 1.35;
  let y = zone.y;
  lines.forEach(l => { if (y < 1065) { ctx.fillText(l, zone.x, y); y += lh; } });
  return y;
}

// ── Smart Template Renderer ───────────────────────────────────
async function drawSmartTemplate(quote, author, keyPoints, templateBuffer, photoBuffer, client, templateName, aiData) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const cfg = TEMPLATE_CONFIGS[templateName] || TEMPLATE_CONFIGS['Quote Card'];
  const sizeM = aiData && aiData.suggested_headline_size === 'large' ? 1.1 : aiData && aiData.suggested_headline_size === 'small' ? 0.75 : 1.0;
  const dynCfg = JSON.parse(JSON.stringify(cfg));
  if (dynCfg.headline) { dynCfg.headline.size = Math.round((cfg.headline.size||50)*sizeM); dynCfg.headline.lineH = Math.round(dynCfg.headline.size*1.25); }

  // Draw template background
  if (templateBuffer) {
    try {
      const tmpl = await loadImage(templateBuffer);
      const scale = Math.max(S/tmpl.width, S/tmpl.height);
      const tw = tmpl.width*scale, th = tmpl.height*scale;
      ctx.drawImage(tmpl, (S-tw)/2, (S-th)/2, tw, th);
    } catch(e) { ctx.fillStyle = cfg.bg==='dark'?'#111':'#f5f5f0'; ctx.fillRect(0,0,S,S); }
  } else { ctx.fillStyle = cfg.bg==='dark'?'#111':'#f5f5f0'; ctx.fillRect(0,0,S,S); }

  // Photo for split layout
  if (dynCfg.splitLayout && dynCfg.photo && photoBuffer) {
    try {
      const p = dynCfg.photo;
      const img = await loadImage(photoBuffer);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, p.radius||0);
      ctx.clip();
      const sc = Math.max(p.w/img.width, p.h/img.height);
      ctx.drawImage(img, p.x+(p.w-img.width*sc)/2, p.y+(p.h-img.height*sc)/2, img.width*sc, img.height*sc);
      ctx.restore();
    } catch(e) {}
  }

  const headline = quote || aiData?.headline || 'Your Story';
  const bodyText = keyPoints && keyPoints.length > 0 ? keyPoints.slice(0,3).join('. ')+'.' : (aiData?.body || 'A powerful insight worth sharing.');
  const today = new Date().toLocaleDateString('en-GB').split('/').join('.');

  // dateText removed - causes confusion across templates
  if (dynCfg.category) {
    // Only draw category bar for split layout templates
    if (dynCfg.splitLayout) {
      ctx.fillStyle = 'rgb(44,74,122)';
      ctx.fillRect(526, 80, 518, 46);
      drawZoneText(ctx, dynCfg.category, '  '+(keyPoints&&keyPoints.length>0?'KEY INSIGHTS':author?'FEATURED QUOTE':'FEATURED POST'));
    }
  }
  // Only draw accent line if this template has one defined (X Style only)
  if (dynCfg.accentLine && templateName === 'X Style') { const al=dynCfg.accentLine; ctx.fillStyle=al.color; ctx.fillRect(al.x,al.y,al.w,al.h); }
  const afterH = drawZoneText(ctx, dynCfg.headline, headline);
  if (dynCfg.body && !author) {
    if (afterH && afterH > dynCfg.body.y) dynCfg.body.y = afterH + 20;
    drawZoneText(ctx, dynCfg.body, bodyText);
  }
  if (author && dynCfg.author) drawZoneText(ctx, dynCfg.author, '— '+author);
  if (dynCfg.cta) { ctx.font='bold '+dynCfg.cta.size+'px sans-serif'; ctx.fillStyle=dynCfg.cta.color; ctx.textAlign='left'; ctx.fillText(dynCfg.cta.text, dynCfg.cta.x, dynCfg.cta.y); }
  drawZoneText(ctx, dynCfg.brandName, client.name||'Visual Pro Media');
  drawZoneText(ctx, dynCfg.handle, '@'+(client.handle||'visualpromediaofficial'));
  return canvas.toBuffer('image/png');
}

// ── Old Template Renderer (fallback) ─────────────────────────
async function drawTemplate(quote, author, keyPoints, bgBuffer, client) {
  const S = 1080;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0f1e'; ctx.fillRect(0,0,S,S);
  const cx=72, cy=72, cw=S-144, ch=S-144;
  if (bgBuffer) {
    try {
      const img = await loadImage(bgBuffer);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,36); ctx.clip();
      const scale=Math.max(cw/img.width,ch/img.height);
      ctx.drawImage(img, cx+(cw-img.width*scale)/2, cy+(ch-img.height*scale)/2, img.width*scale, img.height*scale);
      ctx.fillStyle='rgba(5,8,25,0.80)'; ctx.fillRect(cx,cy,cw,ch);
      ctx.restore();
    } catch(e) { ctx.fillStyle='#0f1629'; ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,36); ctx.fill(); }
  } else { ctx.fillStyle='#0f1629'; ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,36); ctx.fill(); }
  ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(cx,cy,cw,ch,36); ctx.stroke();
  const avR=44, avX=cx+52+avR, avY=cy+60+avR;
  ctx.fillStyle='#1d9bf0'; ctx.beginPath(); ctx.arc(avX,avY,avR,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 32px sans-serif'; ctx.textAlign='center';
  ctx.fillText((client.name||'V')[0].toUpperCase(), avX, avY+11);
  ctx.fillStyle='#ffffff'; ctx.font='bold 34px sans-serif'; ctx.textAlign='left';
  ctx.fillText(client.name||'Visual Pro Media', avX+avR+26, cy+88);
  ctx.fillStyle='rgba(255,255,255,0.65)'; ctx.font='26px sans-serif';
  ctx.fillText('@'+(client.handle||'visualpromediaofficial'), avX+avR+26, cy+126);
  ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(cx+36,cy+168); ctx.lineTo(cx+cw-36,cy+168); ctx.stroke();
  const qLen=(quote||'').length;
  const fSize=qLen<50?52:qLen<90?44:qLen<140?36:30;
  ctx.font='bold '+fSize+'px Georgia, serif'; ctx.fillStyle='#ffffff'; ctx.textAlign='left';
  const maxW=cw-88, words=(quote||'').split(' ');
  const lines=[]; let line='';
  for (const w of words) { const test=line+(line?' ':'')+w; if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=w;}else line=test; }
  if(line)lines.push(line);
  const lh=fSize*1.5, totalH=lines.length*lh;
  let ty=cy+168+(ch-168-248-totalH)/2+fSize;
  lines.forEach(l=>{ctx.fillText(l,cx+44,ty);ty+=lh;});
  if(author){ctx.fillStyle='#1d9bf0';ctx.font='bold 28px sans-serif';ctx.fillText('- '+author,cx+44,cy+ch-248+14);}
  ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(cx+36,cy+ch-214); ctx.lineTo(cx+cw-36,cy+ch-214); ctx.stroke();
  ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,S-58,S,58);
  ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='22px sans-serif'; ctx.textAlign='center';
  ctx.fillText('Follow for daily insights  @'+(client.handle||'visualpromediaofficial'), S/2, S-18);
  return canvas.toBuffer('image/png');
}

// ── Generate AI Content ───────────────────────────────────────
async function generateContent(text, templateName) {
  const tDesc = {
    'X Style':'Dark black card, green accents. Headline top, body middle with accent line.',
    'Dark Luxury':'Cream texture. Centered italic headline + body + author.',
    'Light Clean':'White split layout photo LEFT text RIGHT. Category bar, big bold headline, body, CTA.',
    'News Style':'Cream gradient. Centered headline and body.',
    'Quote Card':'Orange bg with quote box. Quote text + author name only.',
  };
  const systemPrompt = `You are a world-class Instagram content strategist and copywriter. You write content that gets massive engagement - the kind that stops people from scrolling. You think like the best copywriters in the world.

The user will give you a topic or request. Your job is to:
1. Deeply understand what they want
2. Create the BEST possible content for that topic - better than what they could write themselves
3. Make the headline emotional, powerful, and impossible to ignore
4. Make the body text genuinely insightful and valuable
5. If it is a quote request - find the most powerful, relevant REAL quote from a real person
6. If it is motivational - make it truly inspiring, not generic
7. If it is news or tips - make it feel fresh, urgent, and actionable

CONTENT QUALITY RULES:
- Headlines must be POWERFUL and EMOTIONAL - not generic. Bad: "Work Hard". Good: "The habit that made me rich at 30"
- Body text must feel like it was written by an expert - specific, insightful, not vague
- Quotes must be REAL verified quotes from real people - not made up
- For business content - add specific actionable advice that actually works
- For motivational - connect to real human emotions and struggles
- Use power words: secret, proven, massive, transform, unlock, exactly
- Write like you are talking to ONE specific person not a crowd

INSTAGRAM CAPTION RULES:
- Start with a HOOK that grabs attention in first line
- Use line breaks for readability
- End with a question to drive comments
- Include emoji naturally
- Make it feel human and authentic not corporate

Template being used: ${templateName}
Template info: ${tDesc[templateName]||tDesc['Light Clean']}

Respond with ONLY a valid JSON object. No explanation. No markdown. Example structure:
{
  "headline": "Your powerful 5-8 word headline here",
  "quote": "The exact quote sentence if this is a quote post",
  "author": "Person Name or null",
  "body": "Two or three sentences of specific valuable insight for this exact topic.",
  "key_points": ["First specific insight", "Second specific insight", "Third specific insight"],
  "image_prompt": "Photorealistic image of [specific subject matching the topic]. [Mood and lighting]. [Style]. No text in image.",
  "caption": "Opening hook line that stops scrolling.\n\nValue paragraph with specific insight.\n\nClosing question to drive comments?\n\n[emoji]",
  "cta": "Save this for later",
  "hashtags": "#topic #relevant #niche #hashtags #instagram",
  "text_heavy": false,
  "suggested_headline_size": "medium"
}`;

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ],
    max_tokens: 1200,
    temperature: 0.85
  }, { headers: { 'Authorization': 'Bearer '+OPENAI_KEY, 'Content-Type': 'application/json' }, timeout: 30000 });

  const raw = response.data.choices[0].message.content.trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in GPT response');
  const data = JSON.parse(m[0]);
  data.suggested_headline_size = (data.headline||text).length<20?'large':(data.headline||text).length<40?'medium':'small';
  return data;
}

// ── Generate AI Image (DALL-E 3) ──────────────────────────────
async function generateAIImage(prompt) {
  try {
    const res = await axios.post('https://api.openai.com/v1/images/generations', {
      model: 'dall-e-3',
      prompt: prompt + ', photorealistic, high quality, no text overlays',
      n: 1,
      size: '1024x1024',
      quality: 'standard'
    }, { headers: { 'Authorization': 'Bearer '+OPENAI_KEY, 'Content-Type': 'application/json' }, timeout: 30000 });
    if (res.data?.data?.[0]?.url) {
      console.log('DALL-E 3 image generated successfully');
      const buf = await downloadImage(res.data.data[0].url);
      if (buf && buf.byteLength > 10000) return buf;
    }
  } catch(e) { console.log('DALL-E 3 failed:', e.response?.data?.error?.message||e.message); }
  // Fallback Pollinations
  try {
    const url = 'https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt+', cinematic, no text, photorealistic 4k')+'?width=1080&height=1080&nologo=true&seed='+Math.floor(Math.random()*9999);
    const buf = await downloadImage(url);
    if (buf && buf.byteLength > 30000) return buf;
  } catch(e) {}
  return null;
}

// ── Get Background Image ──────────────────────────────────────
async function downloadImage(url) {
  try {
    const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    return Buffer.from(r.data);
  } catch(e) { return null; }
}

async function withTimeout(fn, ms) {
  return Promise.race([fn(), new Promise((_,r) => setTimeout(() => r(new Error('timeout')), ms))]);
}

async function getBackgroundImage(text, newsImageUrl, imagePrompt) {
  if (newsImageUrl) { const b = await downloadImage(newsImageUrl); if (b) return b; }
  const prompt = imagePrompt || (text + ', cinematic, professional photography, no text');
  return await withTimeout(() => generateAIImage(prompt), 35000);
}

// ── Telegram helpers ──────────────────────────────────────────
async function sendText(botToken, chatId, text, parse_mode='Markdown') {
  await axios.post('https://api.telegram.org/bot'+botToken+'/sendMessage', { chat_id: chatId, text, parse_mode });
}

async function sendPhoto(botToken, chatId, imgBuf, caption) {
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', imgBuf, { filename: 'post.png', contentType: 'image/png' });
  form.append('caption', caption||'');
  form.append('parse_mode', 'Markdown');
  await axios.post('https://api.telegram.org/bot'+botToken+'/sendPhoto', form, { headers: form.getHeaders(), timeout: 30000 });
}

// ── Post to Instagram ─────────────────────────────────────────
async function postToInstagram(imgId, caption, client) {
  const imgBuf = imageStore[imgId];
  if (!imgBuf) throw new Error('Image expired');
  const form = new FormData();
  form.append('file', imgBuf, { filename: 'post.png', contentType: 'image/png' });
  const uploadRes = await axios.post(PUBLIC_URL+'/upload-image', form, { headers: form.getHeaders() });
  const imageUrl = uploadRes.data.url;
  const mediaRes = await axios.post('https://graph.instagram.com/v21.0/'+client.igUserId+'/media', {
    image_url: imageUrl, caption, access_token: client.igToken
  });
  await new Promise(r => setTimeout(r, 3000));
  const publishRes = await axios.post('https://graph.instagram.com/v21.0/'+client.igUserId+'/media_publish', {
    creation_id: mediaRes.data.id, access_token: client.igToken
  });
  return publishRes.data.id;
}

// ── Image upload endpoint ─────────────────────────────────────
const tempImages = {};
app.post('/upload-image', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  const id = 'img_'+Date.now();
  tempImages[id] = req.body;
  setTimeout(() => delete tempImages[id], 300000);
  res.json({ url: PUBLIC_URL+'/temp-image/'+id });
});
app.get('/temp-image/:id', (req, res) => {
  const buf = tempImages[req.params.id];
  if (!buf) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'image/png');
  res.send(buf);
});

// ── Admin Panel ───────────────────────────────────────────────
app.get('/admin', (req, res) => {
  const { p, msg } = req.query;
  if (p !== 'vpm2024admin') return res.redirect('/admin-login');
  const clients = loadClients();
  const clientList = Object.values(clients);
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>VPM Admin</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;padding:20px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
h1{font-size:20px;color:#4da6ff}.section-title{font-size:13px;color:#8892a4;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:10px;color:#e8eaf0;font-size:13px}
.btn{background:#4da6ff;color:#060911;border:none;border-radius:8px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:13px}
.card{background:#0d1420;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:16px}
${msg?'':''}</style></head>
<body>
<div class="header"><h1>VPM Admin — ${clientList.length} clients</h1><a href="/admin?p=vpm2024admin"><button class="btn">Refresh</button></a></div>
${msg?'<div style="background:rgba(0,186,124,0.1);border:1px solid #00ba7c;border-radius:8px;padding:12px;margin-bottom:16px;color:#00ba7c">'+msg+'</div>':''}
<div class="card">
<div class="section-title">Add New Client</div>
<form method="POST" action="/admin/add">
<input type="hidden" name="p" value="vpm2024admin">
<div class="form-row">
<input name="name" placeholder="Business Name" required>
<input name="handle" placeholder="Instagram Handle" required>
</div>
<div class="form-row">
<input name="igUserId" placeholder="Instagram User ID" required>
<input name="igToken" placeholder="Instagram Access Token" required>
</div>
<div class="form-row">
<input name="botToken" placeholder="Telegram Bot Token" required>
<input name="email" placeholder="Email (optional)">
</div>
<button type="submit" class="btn">Add Client</button>
</form>
</div>
${clientList.map(c => `<div class="card">
<div style="font-size:15px;font-weight:600;margin-bottom:8px">${c.name} <span style="color:#8892a4;font-size:12px">@${c.handle}</span></div>
<div style="font-size:12px;color:#8892a4;margin-bottom:10px">ID: ${c.id} | IG: ${c.igUserId}</div>
<a href="/admin/delete?p=vpm2024admin&id=${c.id}"><button class="btn" style="background:#e05252">Delete</button></a>
</div>`).join('')}
</body></html>`);
});

app.post('/admin/add', async (req, res) => {
  const { p, name, handle, igUserId, igToken, botToken, email } = req.body;
  if (p !== 'vpm2024admin') return res.redirect('/admin-login');
  const clients = loadClients();
  const id = 'client_'+Date.now();
  clients[id] = { id, name, handle, igUserId, igToken, botToken, email: email||'', active: true, createdAt: new Date().toISOString() };
  saveClients(clients);
  await axios.get('https://api.telegram.org/bot'+botToken+'/setWebhook?url='+PUBLIC_URL+'/webhook/'+id).catch(e => console.log('Webhook err:', e.message));
  res.redirect('/admin?p=vpm2024admin&msg=Client+added+successfully!');
});

app.get('/admin/delete', (req, res) => {
  const { p, id } = req.query;
  if (p !== 'vpm2024admin') return res.redirect('/admin-login');
  const clients = loadClients();
  delete clients[id];
  saveClients(clients);
  res.redirect('/admin?p=vpm2024admin&msg=Client+deleted');
});

// ── Admin Login ───────────────────────────────────────────────
app.get('/admin-login', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>VPM Admin Login</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:40px;width:380px;text-align:center}
h2{margin-bottom:8px;font-size:22px}p{color:#8892a4;font-size:14px;margin-bottom:28px}
input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:14px;color:#e8eaf0;font-size:15px;margin-bottom:16px;outline:none}
button{width:100%;background:#4da6ff;color:#060911;border:none;border-radius:10px;padding:14px;font-size:15px;font-weight:700;cursor:pointer}
</style></head>
<body><div class="box"><h2>VPM Admin Panel</h2><p>Visual Pro Media · Bot Management</p>
<form method="GET" action="/admin">
<input type="password" name="p" placeholder="Enter admin password" required>
<button type="submit">Login</button>
</form></div></body></html>`);
});

// ── Connect Page (Manual) ─────────────────────────────────────
app.get('/connect', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Connect Instagram</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060911;color:#e8eaf0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#0d1420;border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:40px;width:100%;max-width:500px}
h1{font-size:20px;font-weight:700;margin-bottom:8px;text-align:center}
label{display:block;font-size:12px;font-weight:500;color:#8892a4;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;margin-top:16px}
input{width:100%;background:#060911;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px 14px;color:#e8eaf0;font-size:14px;outline:none}
.btn{display:block;background:#4da6ff;border:none;border-radius:12px;padding:15px;color:#060911;font-size:15px;font-weight:700;cursor:pointer;width:100%;margin-top:24px}
</style></head>
<body><div class="card">
<h1>Connect Instagram</h1>
<form method="POST" action="/connect/save">
<label>Business Name</label><input name="name" required>
<label>Instagram Handle</label><input name="handle" required>
<label>Instagram User ID</label><input name="igUserId" required>
<label>Instagram Access Token</label><input name="igToken" required>
<label>Telegram Bot Token</label><input name="botToken" required>
<label>Email</label><input name="email" type="email">
<button type="submit" class="btn">Activate Bot</button>
</form></div></body></html>`);
});

app.post('/connect/save', async (req, res) => {
  const { name, handle, igUserId, igToken, botToken, email } = req.body;
  if (!name||!igToken||!igUserId||!botToken) return res.send('<h2>Please fill all required fields. <a href="/connect">Go back</a></h2>');
  const clients = loadClients();
  const id = 'client_'+Date.now();
  clients[id] = { id, name, handle, igUserId, igToken, botToken, email:email||'', active:true, createdAt:new Date().toISOString() };
  saveClients(clients);
  await axios.get('https://api.telegram.org/bot'+botToken+'/setWebhook?url='+PUBLIC_URL+'/webhook/'+id).catch(e=>console.log('Webhook err:',e.message));
  res.send('<h2 style="font-family:sans-serif;padding:40px;color:green">Bot activated! Open Telegram and send /start</h2>');
});

// ── Instagram OAuth Flow ──────────────────────────────────────
app.get('/ig-connect', (req, res) => {
  const redirectUri = PUBLIC_URL+'/connect/callback';
  const igAuthUrl = 'https://www.instagram.com/oauth/authorize?force_reauth=true&client_id='+process.env.IG_APP_ID+'&redirect_uri='+encodeURIComponent(redirectUri)+'&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights';
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Connect Instagram</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060811;color:#f0ece4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{max-width:480px;width:100%;background:#0d1018;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:48px}
h1{font-size:28px;font-weight:700;margin-bottom:12px}p{color:#8a8a9a;font-size:15px;line-height:1.7;margin-bottom:32px}
.ig-btn{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:18px;background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;border:none;font-size:13px;font-weight:700;letter-spacing:1px;text-decoration:none;border-radius:12px;cursor:pointer;margin-bottom:16px}
.alt{display:block;text-align:center;color:#5a5a6a;font-size:13px;text-decoration:none;margin-top:16px}
.alt:hover{color:#c9a84c}
</style></head>
<body><div class="card">
<h1>Connect Your Instagram 📸</h1>
<p>Click below to securely connect your Instagram account using Meta's official login. We never see or store your password.</p>
<a href="${igAuthUrl}" class="ig-btn">Connect with Instagram</a>
<p style="font-size:12px;color:#5a5a6a;text-align:center">You will be redirected to Instagram's official login page.</p>
<a href="/connect" class="alt">Set up manually instead →</a>
</div></body></html>`);
});

app.get('/connect/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/ig-connect?error=cancelled');
  try {
    const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token',
      new URLSearchParams({ client_id:process.env.IG_APP_ID, client_secret:process.env.IG_APP_SECRET, grant_type:'authorization_code', redirect_uri:PUBLIC_URL+'/connect/callback', code }).toString(),
      { headers:{'Content-Type':'application/x-www-form-urlencoded'} }
    );
    const shortToken = tokenRes.data.access_token;
    const igUserId = tokenRes.data.user_id;
    const longRes = await axios.get('https://graph.instagram.com/access_token', { params:{grant_type:'ig_exchange_token',client_id:process.env.IG_APP_ID,client_secret:process.env.IG_APP_SECRET,access_token:shortToken} });
    const longToken = longRes.data.access_token;
    const profileRes = await axios.get('https://graph.instagram.com/me', { params:{fields:'id,username',access_token:longToken} });
    const igHandle = profileRes.data.username;
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Almost Done!</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060811;color:#f0ece4;min-height:100vh;padding:48px 24px}
.wrap{max-width:560px;margin:0 auto}h1{font-size:28px;font-weight:700;margin-bottom:8px}
p{color:#8a8a9a;font-size:15px;line-height:1.7;margin-bottom:28px}
label{display:block;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#5a5a6a;margin-bottom:6px;margin-top:18px}
input,select{width:100%;background:#0d1018;border:1px solid rgba(255,255,255,0.1);padding:13px 15px;color:#f0ece4;font-size:14px;border-radius:8px;outline:none}
input[readonly]{color:#5a5a6a}.btn{display:block;width:100%;background:#c9a84c;color:#060811;border:none;padding:18px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;margin-top:24px;border-radius:8px}
.success{display:flex;align-items:center;gap:12px;background:rgba(46,204,138,0.07);border:1px solid rgba(46,204,138,0.2);padding:14px 18px;border-radius:10px;margin-bottom:28px;color:#2ecc8a;font-weight:600}
</style></head>
<body><div class="wrap">
<div class="success">✅ @${igHandle} Connected!</div>
<h1>Almost Done!</h1>
<p>Instagram connected! Fill in a few more details to activate your bot.</p>
<form method="POST" action="/ig-save">
<input type="hidden" name="igToken" value="${longToken}">
<input type="hidden" name="igUserId" value="${igUserId}">
<input type="hidden" name="handle" value="${igHandle}">
<label>Business Name</label><input name="name" required>
<label>Your Name</label><input name="ownerName">
<label>Email</label><input name="email" type="email" required>
<label>Niche</label>
<select name="niche" required><option value="" disabled selected>Select niche</option>
<option>Digital Marketing</option><option>Real Estate</option><option>Fashion & Lifestyle</option>
<option>Food & Restaurant</option><option>Fitness & Health</option><option>Technology</option>
<option>Finance & Investment</option><option>Education & Coaching</option><option>Travel & Tourism</option><option>Other</option>
</select>
<label>Instagram Account</label><input value="@${igHandle}" readonly>
<label>Telegram Bot Token</label><input name="botToken" placeholder="From @BotFather" required>
<button type="submit" class="btn">Activate My Bot Now →</button>
</form></div></body></html>`);
  } catch(e) {
    console.error('OAuth error:', e.response?.data||e.message);
    res.redirect('/ig-connect?error=failed');
  }
});

app.post('/ig-save', async (req, res) => {
  const { name, ownerName, email, niche, igToken, igUserId, handle, botToken } = req.body;
  if (!name||!igToken||!igUserId||!botToken) return res.send('<h2>Please fill all fields. <a href="javascript:history.back()">Go back</a></h2>');
  const clients = loadClients();
  const id = 'client_'+Date.now();
  clients[id] = { id, name, ownerName:ownerName||'', email:email||'', niche:niche||'', handle, igUserId:String(igUserId), igToken, botToken, active:true, createdAt:new Date().toISOString() };
  saveClients(clients);
  await axios.get('https://api.telegram.org/bot'+botToken+'/setWebhook?url='+PUBLIC_URL+'/webhook/'+id).catch(e=>console.log('Webhook err:',e.message));
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bot Live!</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060811;color:#f0ece4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
.card{max-width:520px;width:100%}h1{font-size:56px;font-weight:700;margin-bottom:16px}h1 span{color:#c9a84c}
p{color:#8a8a9a;font-size:16px;line-height:1.8;margin-bottom:36px}
.btn{display:inline-block;background:#c9a84c;color:#060811;padding:16px 44px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;border-radius:8px}
</style></head>
<body><div class="card">
<h1>Bot is <span>Live!</span> 🎉</h1>
<p>Welcome ${name}! Your AI Instagram bot for @${handle} is now active. Open Telegram, find your bot, and send /start!</p>
<a href="https://t.me" class="btn">Open Telegram →</a>
<p style="margin-top:20px;font-size:13px">Need help? DM <a href="https://www.instagram.com/visualpromediaofficial" style="color:#c9a84c">@visualpromediaofficial</a></p>
</div></body></html>`);
});

// ── Payment Routes ────────────────────────────────────────────
app.get('/pay', (req, res) => {
  const { plan } = req.query;
  const isQuarterly = plan === 'quarterly';
  const amount = isQuarterly ? 450000 : 200000;
  const planName = isQuarterly ? '3 Month Bundle' : 'Monthly Plan';
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payment - Visual Pro Media</title>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:#060811;color:#f0ece4;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#0d1018;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:48px;max-width:440px;width:100%;text-align:center}
h1{font-size:26px;margin-bottom:8px}p{color:#8a8a9a;margin-bottom:32px}
.price{font-size:56px;font-weight:700;color:#c9a84c;margin-bottom:8px}
.btn{background:#c9a84c;color:#060811;border:none;padding:18px 48px;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;border-radius:8px;margin-top:16px;width:100%}
</style></head>
<body><div class="card">
<h1>${planName}</h1>
<div class="price">Rs.${isQuarterly?'4,500':'2,000'}</div>
<p>${isQuarterly?'3 months of AI Instagram automation':'1 month of AI Instagram automation'}</p>
<button class="btn" onclick="openPayment()">Pay Now →</button>
</div>
<script>
function openPayment() {
  var options = {
    key: '${process.env.RAZORPAY_KEY_ID||''}',
    amount: ${amount},
    currency: 'INR',
    name: 'Visual Pro Media',
    description: '${planName}',
    handler: function(response) {
      window.location.href = '/payment-success?plan=${plan}&payment_id='+response.razorpay_payment_id;
    },
    prefill: { name: '', email: '', contact: '' },
    theme: { color: '#c9a84c' }
  };
  var rzp = new Razorpay(options);
  rzp.open();
}
</script></body></html>`);
});

app.get('/payment-success', (req, res) => {
  const { plan, payment_id } = req.query;
  res.redirect('/ig-connect?plan='+plan+'&payment_id='+payment_id);
});

// ── Privacy, Terms, Data Deletion ────────────────────────────
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Privacy Policy</title></head>
<body style="font-family:sans-serif;padding:40px;max-width:700px;margin:0 auto">
<h1>Privacy Policy</h1><p>Visual Pro Media collects Instagram access tokens to post content on your behalf. We do not sell your data. Contact: zmedia.ai29@gmail.com</p>
</body></html>`);
});

app.get('/terms', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Terms of Service</title></head>
<body style="font-family:sans-serif;padding:40px;max-width:700px;margin:0 auto">
<h1>Terms of Service</h1><p>By using Visual Pro Media services you agree to our terms. We provide AI-powered Instagram automation. Contact: zmedia.ai29@gmail.com</p>
</body></html>`);
});

app.get('/data-deletion', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Data Deletion</title></head>
<body style="font-family:sans-serif;padding:40px;max-width:700px;margin:0 auto">
<h1>Data Deletion</h1><p>To delete your data email zmedia.ai29@gmail.com and we will confirm via email within 48 hours.</p>
</body></html>`);
});

// ── Homepage = Landing Page ───────────────────────────────────
app.get('/', (req, res) => { res.send(LANDING_PAGE_HTML); });
app.get('/landing', (req, res) => { res.send(LANDING_PAGE_HTML); });
app.get('/start', (req, res) => { res.send(LANDING_PAGE_HTML); });

// ── Webhook Handler ───────────────────────────────────────────
app.post('/webhook/:clientId', async (req, res) => {
  res.sendStatus(200);
  const clients = loadClients();
  const client = clients[req.params.clientId];
  if (!client) return;

  // Handle callback queries (template buttons)
  if (req.body && req.body.callback_query) {
    const cb = req.body.callback_query;
    const chatId = cb.message.chat.id;
    await axios.post('https://api.telegram.org/bot'+client.botToken+'/answerCallbackQuery', { callback_query_id: cb.id }).catch(()=>{});
    if (cb.data && cb.data.startsWith('template:')) {
      const chosen = cb.data.replace('template:','');
      if (chosen === 'custom') {
        userTemplates[chatId] = 'custom';
        await sendText(client.botToken, chatId, '📷 *Send me a photo* and I will use it as the background for your posts!\n\nOr send /template to pick a different style.', 'Markdown');
      } else {
        userTemplates[chatId] = chosen;
        userPhotos[chatId] = null;
        await sendText(client.botToken, chatId, '✅ Template set to *'+chosen+'* '+TEMPLATES[chosen].emoji+'\n\nNow send me any topic to create a post!', 'Markdown');
      }
    }
    return;
  }

  const msg = req.body && req.body.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const text = (msg.text||'').trim();
  const lower = text.toLowerCase();
  const sessionKey = client.id+'_'+chatId;

  try {
    if (lower === '/start') {
      await sendText(client.botToken, chatId,
        `Welcome to *${client.name} Bot!* 🎨\n\nPowered by GPT-4o + DALL-E 3!\n\n📌 *Commands:*\n/template — Choose your post template style\n\n📝 *To create a post:*\nJust type any topic!\n\nReply *approve* to post\nReply *redo* to regenerate\n\nStart by choosing your template 👇`);
      await sendTemplateMenu(client.botToken, chatId);
      return;
    }

    if (lower === '/template') {
      await sendTemplateMenu(client.botToken, chatId);
      return;
    }

    // Photo upload
    if (msg.photo && msg.photo.length > 0) {
      const photo = msg.photo[msg.photo.length-1];
      try {
        const fileRes = await axios.get('https://api.telegram.org/bot'+client.botToken+'/getFile?file_id='+photo.file_id);
        const filePath = fileRes.data.result.file_path;
        const imgBuf = await downloadImage('https://api.telegram.org/file/bot'+client.botToken+'/'+filePath);
        if (imgBuf) {
          userPhotos[chatId] = imgBuf;
          userTemplates[chatId] = 'custom';
          await sendText(client.botToken, chatId, '✅ *Photo saved!*\n\nNow send me a topic to create your post!', 'Markdown');
        }
      } catch(e) { await sendText(client.botToken, chatId, 'Could not process photo. Please try again!'); }
      return;
    }

    if (lower === 'approve' && sessions[sessionKey]) {
      const s = sessions[sessionKey];
      await sendText(client.botToken, chatId, '📤 Posting to Instagram...');
      const postId = await postToInstagram(s.imgId, s.caption+'\n\n'+s.hashtags, client);
      delete sessions[sessionKey];
      await sendText(client.botToken, chatId, '✅ Posted to @'+client.handle+'!\n\nPost ID: '+postId);
      return;
    }

    if ((lower === 'redo'||lower === 'cancel') && sessions[sessionKey]) {
      delete sessions[sessionKey];
      await sendText(client.botToken, chatId, 'Cancelled. Send a new topic!');
      return;
    }

    const chosenTemplate = userTemplates[chatId] || TEMPLATE_NAMES[0];
    const userPhoto = userPhotos[chatId] || null;

    await sendText(client.botToken, chatId, '🎨 Creating post about:\n*"'+text+'"*\n\nTemplate: '+chosenTemplate+'\n\nGenerating content... ~30 seconds');

    const data = await generateContent(text, chosenTemplate);
    const kp = data.key_points || [];

    const hasTemplate = chosenTemplate && chosenTemplate !== 'custom' && TEMPLATES[chosenTemplate];
    const templateBuf = hasTemplate ? await getTemplateBuffer(chosenTemplate) : null;
    let postPhoto = userPhoto;
    if (!postPhoto) postPhoto = await getBackgroundImage(text, data._newsImageUrl, data.image_prompt);

    // Clean the quote/headline - reject if it looks like prompt text leaked
    const rawQuote = data.quote || data.headline || text;
    const cleanQuote = (rawQuote && rawQuote.length < 200 && !rawQuote.includes('if quote request') && !rawQuote.includes('otherwise same')) ? rawQuote : (data.headline || text);

    let imgBuf;
    if (hasTemplate || userPhoto) {
      imgBuf = await drawSmartTemplate(cleanQuote, data.author||'', kp, templateBuf, postPhoto, client, chosenTemplate, data);
    } else {
      imgBuf = await drawTemplate(cleanQuote, data.author||'', kp, postPhoto, client);
    }

    const imgId = 'img_'+Date.now();
    imageStore[imgId] = imgBuf;
    setTimeout(()=>{ delete imageStore[imgId]; }, 600000);
    sessions[sessionKey] = { imgId, caption: data.caption||'', cta: data.cta||'', hashtags: data.hashtags||'' };

    const cap = data.caption||'';
    const shortCap = cap.length > 600 ? cap.substring(0,600)+'...' : cap;
    const preview = shortCap+'\n\n'+(data.hashtags||'').substring(0,200)+'\n\n✅ Reply *approve* to post\n🔄 Reply *redo* to regenerate';
    await sendPhoto(client.botToken, chatId, imgBuf, preview.length>1020?preview.substring(0,1020):preview);

  } catch(err) {
    console.error('Webhook error:', err.message, err.response?.data);
    await sendText(client.botToken, chatId, 'Something went wrong. Please try again!');
  }
});

// ── Keep alive ────────────────────────────────────────────────
setInterval(() => { axios.get(PUBLIC_URL+'/health').catch(()=>{}); }, 600000);
app.get('/health', (req, res) => res.send('OK'));

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('VPM SaaS Bot running! Port: '+PORT));
