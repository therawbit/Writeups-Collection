const writeupList = document.getElementById("writeupList");
const searchInput = document.getElementById("searchInput");
const categorySelect = document.getElementById("categorySelect");
const showFavsBtn = document.getElementById("showFavs");
const showDoneBtn = document.getElementById("showDone");
const showAllBtn = document.getElementById("showAll");
const STORAGE_KEYS = {
  DONE: 'ctf_done',
  FAV: 'ctf_fav',
};

// Cache and performance variables
let writeups = {};
let filteredKeys = [];
let currentFilter = "all";
let doneSet = new Set();
let favSet = new Set();
let isLoading = true;
let debounceTimer;

// Pagination variables
const ITEMS_PER_PAGE = 24; // Adjusted for grid view (multiple of common screen widths)
let currentPage = 1;
let totalPages = 1;

// Initialize the application
function initialize() {
  // Load saved preferences from localStorage
  try {
    const doneData = localStorage.getItem(STORAGE_KEYS.DONE);
    const favData = localStorage.getItem(STORAGE_KEYS.FAV);
    doneSet = new Set(doneData ? JSON.parse(doneData) : []);
    favSet = new Set(favData ? JSON.parse(favData) : []);
  } catch (e) {
    console.error("Error loading from localStorage:", e);
    // Reset if there's an error
    doneSet = new Set();
    favSet = new Set();
  }

  // Create and show loading indicator
  showLoadingState();
  
  // Fetch writeups with cache control
  fetch('writeups.json', { 
    cache: 'force-cache',
    headers: {
      'Accept': 'application/json'
    }
  })
    .then(res => {
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    })
    .then(data => {
      writeups = data;
      isLoading = false;
      populateCategories();
      setupEventListeners();
      applyFilter();
    })
    .catch(err => {
      console.error("Failed to fetch writeups:", err);
      showErrorState("Failed to load writeups. Please refresh and try again.");
    });
}

// Show loading indicator
function showLoadingState() {
  // Create a loading container that follows the existing design
  writeupList.innerHTML = `
    <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
      <h3>Loading CTF writeups...</h3>
      <div class="meta">Please wait while we fetch the data</div>
    </div>
  `;
}

// Show error state
function showErrorState(message) {
  writeupList.innerHTML = `
    <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 2rem; border-color: #ff5555;">
      <h3>Error</h3>
      <div class="meta">${message}</div>
    </div>
  `;
}

// Populate category dropdown
function populateCategories() {
  // Use a Set for unique categories
  const catSet = new Set();
  
  // Gather all unique categories efficiently
  Object.values(writeups).forEach(w => {
    if (w.categories && Array.isArray(w.categories)) {
      w.categories.forEach(cat => cat && catSet.add(cat.toLowerCase()));
    }
  });
  
  // Use a fragment for better performance
  const fragment = document.createDocumentFragment();
  const sorted = [...catSet].sort();
  
  // Create and append options
  sorted.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    fragment.appendChild(opt);
  });
  
  categorySelect.appendChild(fragment);
}

// Debounced search to prevent excessive filtering
function debouncedApplyFilter() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    currentPage = 1; // Reset to first page on new filter
    applyFilter();
  }, 300);
}

// Filter writeups based on search, category, and current filter type
function applyFilter() {
  if (isLoading) return;
  
  const q = searchInput.value.toLowerCase();
  const selectedCat = categorySelect.value;
  
  // Filter the writeups - this is the most performance-critical part
  // Use a more efficient filtering approach
  filteredKeys = Object.keys(writeups).filter(id => {
    const w = writeups[id];
    
    // Check filter sets first (early returns for performance)
    if (currentFilter === "favs" && !favSet.has(id)) return false;
    if (currentFilter === "done" && !doneSet.has(id)) return false;
    
    // Category filter (early return)
    if (selectedCat && (!w.categories || !w.categories.some(c => c.toLowerCase() === selectedCat))) {
      return false;
    }
    
    // Only perform search if there's a query
    if (q) {
      // Check most common fields first for early returns
      if (w.task_name && w.task_name.toLowerCase().includes(q)) return true;
      if (w.event_name && w.event_name.toLowerCase().includes(q)) return true;
      // Check categories last as they require joining
      return w.categories && w.categories.join(" ").toLowerCase().includes(q);
    }
    
    return true;
  });
  
  // Calculate total pages
  totalPages = Math.ceil(filteredKeys.length / ITEMS_PER_PAGE);
  
  // Ensure current page is valid
  if (currentPage > totalPages) {
    currentPage = Math.max(1, totalPages);
  }
  
  // Update filter button states
  updateFilterButtonStates();
  
  // Render the current page
  renderCurrentPage();
}

// Update active state of filter buttons
function updateFilterButtonStates() {
  // Remove active state from all buttons
  [showAllBtn, showFavsBtn, showDoneBtn].forEach(btn => {
    btn.style.backgroundColor = '';
    btn.style.color = '';
  });
  
  // Add active state to current filter button
  let activeBtn;
  if (currentFilter === "favs") {
    activeBtn = showFavsBtn;
  } else if (currentFilter === "done") {
    activeBtn = showDoneBtn;
  } else {
    activeBtn = showAllBtn;
  }
  
  // Apply active styling
  if (activeBtn) {
    activeBtn.style.backgroundColor = 'var(--accent)';
    activeBtn.style.color = 'var(--bg)';
  }
}

// Render the current page of items
function renderCurrentPage() {
  // Calculate slice indices
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, filteredKeys.length);
  const pageKeys = filteredKeys.slice(startIdx, endIdx);
  
  // Clear existing content
  writeupList.innerHTML = '';
  
  // Show message if no results
  if (pageKeys.length === 0) {
    writeupList.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
        <h3>No matching writeups found</h3>
        <div class="meta">Try adjusting your search or filters</div>
      </div>
    `;
    renderPagination();
    return;
  }
  
  // Create a document fragment for better performance
  const fragment = document.createDocumentFragment();
  
  // Create cards for each item
  pageKeys.forEach(id => {
    const w = writeups[id];
    const card = document.createElement('div');
    card.className = 'card';
    
    // Use template literals for better performance
    card.innerHTML = `
      <h3><a href="${w.task_link || '#'}" target="_blank">${w.task_name || 'Unnamed Task'}</a></h3>
      <div class="meta">
        Event: <a href="${w.event_link || '#'}" target="_blank">${w.event_name || 'Unknown Event'}</a><br/>
        Categories: ${w.categories ? w.categories.join(", ") : 'None'}
      </div>
      <a href="${w.writeup_link_ctftime || '#'}" target="_blank">📖 View Writeup</a>
      <div class="badges">
        <span class="badge ${doneSet.has(id) ? "done" : ""}" data-id="${id}" data-action="done">✅ Done</span>
        <span class="badge ${favSet.has(id) ? "fav" : ""}" data-id="${id}" data-action="fav">⭐ Favorite</span>
      </div>
    `;
    
    fragment.appendChild(card);
  });
  
  writeupList.appendChild(fragment);
  
  // Add results summary
  const resultsSummary = document.createElement('div');
  resultsSummary.className = 'card';
  resultsSummary.style.gridColumn = '1 / -1';
  resultsSummary.style.textAlign = 'center';
  resultsSummary.style.padding = '0.5rem';
  resultsSummary.style.marginBottom = '1rem';
  resultsSummary.innerHTML = `
    <div class="meta">
      Showing ${startIdx + 1}-${endIdx} of ${filteredKeys.length} writeups
    </div>
  `;
  
  writeupList.insertBefore(resultsSummary, writeupList.firstChild);
  
  // Render pagination controls
  renderPagination();
}

// Create and render pagination controls
function renderPagination() {
  // Remove existing pagination if any
  const existingPagination = document.getElementById('pagination');
  if (existingPagination) {
    existingPagination.remove();
  }
  
  // Skip if only one page
  if (totalPages <= 1) return;
  
  // Create pagination container
  const pagination = document.createElement('div');
  pagination.id = 'pagination';
  pagination.style.display = 'flex';
  pagination.style.justifyContent = 'center';
  pagination.style.gap = '10px';
  pagination.style.margin = '2rem 0';
  pagination.style.gridColumn = '1 / -1';
  
  // Create "Previous" button
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Previous';
  prevBtn.disabled = currentPage === 1;
  prevBtn.style.opacity = currentPage === 1 ? '0.5' : '1';
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderCurrentPage();
      window.scrollTo(0, 0);
    }
  });
  
  // Create page indicator
  const pageInfo = document.createElement('div');
  pageInfo.style.display = 'flex';
  pageInfo.style.alignItems = 'center';
  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  
  // Create "Next" button
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.style.opacity = currentPage === totalPages ? '0.5' : '1';
  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderCurrentPage();
      window.scrollTo(0, 0);
    }
  });
  
  // Style buttons to match your theme
  [prevBtn, nextBtn].forEach(btn => {
    btn.style.backgroundColor = 'var(--card)';
    btn.style.color = 'var(--fg)';
    btn.style.border = '1px solid var(--border)';
    btn.style.padding = '0.5rem 1rem';
    btn.style.borderRadius = '6px';
    btn.style.cursor = 'pointer';
  });
  
  // Add buttons to pagination
  pagination.appendChild(prevBtn);
  pagination.appendChild(pageInfo);
  pagination.appendChild(nextBtn);
  
  // Add pagination after the writeup list
  writeupList.after(pagination);
}

// Handle badge clicks using event delegation
function handleBadgeClick(e) {
  // Check if clicked element is a badge
  if (!e.target.classList.contains('badge')) return;
  
  const id = e.target.dataset.id;
  const action = e.target.dataset.action;
  
  if (!id || !action) return;
  
  if (action === 'done') {
    toggleDone(id);
  } else if (action === 'fav') {
    toggleFav(id);
  }
}

// Toggle done status
function toggleDone(id) {
  if (doneSet.has(id)) {
    doneSet.delete(id);
  } else {
    doneSet.add(id);
  }
  
  // Update UI
  document.querySelectorAll(`.badge[data-id="${id}"][data-action="done"]`).forEach(el => {
    el.classList.toggle("done");
  });
  
  // Save to localStorage (throttled)
  scheduleStorageUpdate(STORAGE_KEYS.DONE, [...doneSet]);
  
  // Reapply filter if we're on the "done" view
  if (currentFilter === "done") {
    applyFilter();
  }
}

// Toggle favorite status
function toggleFav(id) {
  if (favSet.has(id)) {
    favSet.delete(id);
  } else {
    favSet.add(id);
  }
  
  // Update UI
  document.querySelectorAll(`.badge[data-id="${id}"][data-action="fav"]`).forEach(el => {
    el.classList.toggle("fav");
  });
  
  // Save to localStorage (throttled)
  scheduleStorageUpdate(STORAGE_KEYS.FAV, [...favSet]);
  
  // Reapply filter if we're on the "favs" view
  if (currentFilter === "favs") {
    applyFilter();
  }
}

// Batch localStorage updates for better performance
let pendingStorageUpdates = {};
let storageUpdateTimer;

function scheduleStorageUpdate(key, data) {
  pendingStorageUpdates[key] = data;
  
  clearTimeout(storageUpdateTimer);
  storageUpdateTimer = setTimeout(() => {
    for (const [key, value] of Object.entries(pendingStorageUpdates)) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        console.error("Error saving to localStorage:", e);
      }
    }
    pendingStorageUpdates = {};
  }, 500);
}

// Set up event listeners
function setupEventListeners() {
  // Use event delegation for badge clicks
  writeupList.addEventListener("click", handleBadgeClick);
  
  // Debounce search input
  searchInput.addEventListener("input", debouncedApplyFilter);
  
  // Category select
  categorySelect.addEventListener("change", () => {
    currentPage = 1;
    applyFilter();
  });
  
  // Filter buttons
  showFavsBtn.addEventListener("click", () => {
    currentFilter = "favs";
    currentPage = 1;
    applyFilter();
  });
  
  showDoneBtn.addEventListener("click", () => {
    currentFilter = "done";
    currentPage = 1;
    applyFilter();
  });
  
  showAllBtn.addEventListener("click", () => {
    currentFilter = "all";
    currentPage = 1;
    applyFilter();
  });
  
  // Add keyboard navigation
  document.addEventListener('keydown', (e) => {
    // Only handle if not in input or select
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    
    if (e.key === 'ArrowLeft' && currentPage > 1) {
      currentPage--;
      renderCurrentPage();
      window.scrollTo(0, 0);
    } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
      currentPage++;
      renderCurrentPage();
      window.scrollTo(0, 0);
    }
  });
}

// Start the application
initialize();