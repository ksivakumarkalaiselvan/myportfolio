// Loading Screen
window.addEventListener('load', function() {
  document.getElementById('loader').classList.add('fade');
  setTimeout(function() {
    document.getElementById('loader').style.display = 'none';
  }, 500);
});

// Typing Animation
var roles = [
  'Full Stack Developer',
  'AI Enthusiast',
  'UI/UX Designer',
  'Problem Solver'
];
var roleIndex = 0;
var charIndex = 0;
var isDeleting = false;
var typedEl = document.getElementById('typed-text');

function typeEffect() {
  var current = roles[roleIndex];
  if (!isDeleting) {
    typedEl.textContent = current.substring(0, charIndex + 1);
    charIndex++;
    if (charIndex === current.length) {
      isDeleting = true;
      setTimeout(typeEffect, 2000);
      return;
    }
    setTimeout(typeEffect, 100);
  } else {
    typedEl.textContent = current.substring(0, charIndex - 1);
    charIndex--;
    if (charIndex === 0) {
      isDeleting = false;
      roleIndex = (roleIndex + 1) % roles.length;
      setTimeout(typeEffect, 500);
      return;
    }
    setTimeout(typeEffect, 50);
  }
}
typeEffect();

// Navbar Scroll & Hamburger
var navbar = document.getElementById('navbar');
var hamburger = document.getElementById('hamburger');
var navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', function() {
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

hamburger.addEventListener('click', function() {
  hamburger.classList.toggle('active');
  navLinks.classList.toggle('open');
});

document.querySelectorAll('.nav-links a').forEach(function(link) {
  link.addEventListener('click', function() {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
  });
});

// Active Nav Link Highlighting
var sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', function() {
  var current = '';
  sections.forEach(function(section) {
    var top = section.offsetTop - 150;
    if (window.scrollY >= top) {
      current = section.getAttribute('id');
    }
  });
  document.querySelectorAll('.nav-links a').forEach(function(link) {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) {
      link.classList.add('active');
    }
  });
});

// Scroll to Top
var scrollBtn = document.getElementById('scrollTop');

window.addEventListener('scroll', function() {
  if (window.scrollY > 400) {
    scrollBtn.classList.add('show');
  } else {
    scrollBtn.classList.remove('show');
  }
});

scrollBtn.addEventListener('click', function() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Scroll Reveal Animations
var observer = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.section').forEach(function(el) {
  el.classList.add('fade-in');
  observer.observe(el);
});

// Skill Progress Bars
var skillObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      var progress = entry.target.querySelector('.progress');
      if (progress) {
        progress.style.width = progress.dataset.width + '%';
      }
    }
  });
}, { threshold: 0.3 });

document.querySelectorAll('.skill-card').forEach(function(card) {
  skillObserver.observe(card);
});

// Animated Counters
var counterObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      var num = entry.target;
      var target = parseInt(num.dataset.target);
      var count = 0;
      var step = Math.ceil(target / 40);
      var interval = setInterval(function() {
        count += step;
        if (count >= target) {
          num.textContent = target + '+';
          clearInterval(interval);
        } else {
          num.textContent = count;
        }
      }, 40);
      counterObserver.unobserve(num);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-num').forEach(function(num) {
  counterObserver.observe(num);
});

// Contact Form
document.getElementById('contactForm').addEventListener('submit', function(e) {
  e.preventDefault();
  alert('Thank you! Your message has been sent successfully.');
  e.target.reset();
});
