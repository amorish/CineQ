const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'assets/js/app.js');
let buf = fs.readFileSync(p);
// Find the index of "function initExperience" (which might be in utf16, so look for "f\x00u\x00n\x00c\x00" etc, or just find where the normal text ends)
// Let's just find the last valid part:
const validText = "document.querySelectorAll('.custom-select-options').forEach(o => o.classList.remove('open'));\r\n});\r\n \r\n";
let validBuf = Buffer.from(validText);
let idx = buf.lastIndexOf(validBuf);
if (idx !== -1) {
  // truncate
  buf = buf.slice(0, idx + validBuf.length);
} else {
  console.log("Could not find valid text marker");
  // fallback to a string search
  let str = fs.readFileSync(p, 'utf8');
  let idx2 = str.indexOf("f\u0000u\u0000n\u0000c\u0000t\u0000i\u0000o\u0000n\u0000 \u0000i\u0000n\u0000i\u0000t\u0000E\u0000x\u0000p\u0000e\u0000r\u0000i\u0000e\u0000n\u0000c\u0000e");
  if(idx2 !== -1) {
      buf = Buffer.from(str.slice(0, idx2), 'utf8');
  }
}

const componentCode = `
function initExperienceComponent(itemId, type, item) {
  const triggerBtn = document.getElementById('add-experience-btn');
  const wrapper = document.getElementById('review-wrapper');
  const editState = document.getElementById('edit-state');
  const readState = document.getElementById('read-state');
  const container = document.getElementById('heart-review');
  const textInput = document.getElementById('comment-input');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const editBtn = document.getElementById('edit-btn');
  const staticHeartsContainer = document.getElementById('static-hearts');
  const submittedComment = document.getElementById('submitted-comment');

  if (!triggerBtn || !wrapper) return;

  let currentRating = 0; 
  const heartPath = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

  for (let i = 1; i <= 5; i++) {
    const heartDiv = document.createElement('div');
    heartDiv.className = 'heart-wrapper';
    heartDiv.dataset.index = i;
    heartDiv.innerHTML = \`
      <svg class="heart-empty" viewBox="0 0 24 24"><path d="\${heartPath}"/></svg>
      <svg class="heart-filled" viewBox="0 0 24 24"><path d="\${heartPath}"/></svg>
      <div class="half-hitbox left" data-val="\${i - 0.5}"></div>
      <div class="half-hitbox right" data-val="\${i}"></div>
    \`;
    container.appendChild(heartDiv);
  }

  function updateVisuals(rating) {
    let lightness = 100; 
    if (rating > 0) lightness = 100 - (rating * 10); 
    wrapper.style.setProperty('--active-color', \`hsl(350, 100%, \${lightness}%)\`);

    const hearts = container.querySelectorAll('.heart-wrapper');
    hearts.forEach((heart, index) => {
      const heartValue = index + 1;
      heart.classList.remove('full', 'half');
      if (rating >= heartValue) heart.classList.add('full'); 
      else if (rating === heartValue - 0.5) heart.classList.add('half'); 
    });
  }

  const hitboxes = container.querySelectorAll('.half-hitbox');
  hitboxes.forEach(hitbox => {
    hitbox.addEventListener('mouseenter', (e) => updateVisuals(parseFloat(e.target.dataset.val)));
    hitbox.addEventListener('click', (e) => {
      const clickedValue = parseFloat(e.target.dataset.val);
      if (currentRating === clickedValue) currentRating = 0;
      else currentRating = clickedValue;
      updateVisuals(currentRating);
    });
  });
  
  container.addEventListener('mouseleave', () => updateVisuals(currentRating));

  triggerBtn.addEventListener('click', () => {
    triggerBtn.style.display = 'none';
    wrapper.style.display = 'block';
    setTimeout(() => wrapper.classList.add('visible'), 10);
  });

  cancelBtn.addEventListener('click', () => {
    if (item.experience) {
      renderReadState();
      return;
    }
    wrapper.classList.remove('visible');
    setTimeout(() => {
      wrapper.style.display = 'none';
      triggerBtn.style.display = 'block';
      currentRating = 0;
      textInput.value = '';
      updateVisuals(0);
    }, 300); 
  });

  saveBtn.addEventListener('click', () => {
    const commentText = textInput.value.trim();
    if (currentRating === 0 && commentText === "") {
      cancelBtn.click();
      return;
    }
    
    item.experience = { rating: currentRating, comment: commentText };
    saveLibraryToFirebase();
    renderReadState();
  });

  editBtn.addEventListener('click', () => {
    readState.style.display = 'none';
    editState.style.display = 'flex';
  });

  function renderReadState() {
    if (!item.experience) return;
    const { rating, comment } = item.experience;
    currentRating = rating;
    textInput.value = comment;
    updateVisuals(rating);

    triggerBtn.style.display = 'none';
    wrapper.style.display = 'block';
    wrapper.classList.add('visible');

    editState.style.display = 'none';
    readState.style.display = 'flex';

    if (comment !== "") {
      submittedComment.style.display = '-webkit-box';
      submittedComment.innerText = comment;
    } else {
      submittedComment.style.display = 'none';
    }

    if (rating === 0) {
      staticHeartsContainer.style.display = 'none'; 
    } else {
      staticHeartsContainer.style.display = 'flex'; 
      staticHeartsContainer.innerHTML = ''; 
      
      let lightness = 100 - (rating * 10); 
      const exactColor = \`hsl(350, 100%, \${lightness}%)\`;

      for (let i = 1; i <= 5; i++) {
        let opacity = 0;
        let clip = 'none';
        if (rating >= i) { opacity = 1; } 
        else if (rating === i - 0.5) { opacity = 1; clip = 'polygon(0 0, 50% 0, 50% 100%, 0 100%)'; }
        staticHeartsContainer.innerHTML += \`
          <div class="static-heart">
            <svg class="heart-empty" viewBox="0 0 24 24"><path d="\${heartPath}"/></svg>
            <svg viewBox="0 0 24 24" style="position: absolute; top:0; left:0; width: 100%; height: 100%; fill: \${exactColor}; stroke: \${exactColor}; opacity: \${opacity}; clip-path: \${clip};"><path d="\${heartPath}"/></svg>
          </div>
        \`;
      }
    }
  }

  if (item.experience) {
    renderReadState();
  } else {
    triggerBtn.style.display = 'block';
  }
}
`;

fs.writeFileSync(p, Buffer.concat([buf, Buffer.from(componentCode, 'utf8')]));
console.log("Fixed app.js");
