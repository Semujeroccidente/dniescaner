class PaginationManager {
    constructor(itemsPerPage = 10) {
        this.itemsPerPage = itemsPerPage;
        this.currentPage = 1;
        this.totalItems = 0;
        this.totalPages = 0;
        this.onPageChange = null; // Callback function
    }

    init(totalItems, onPageChangeCallback) {
        this.totalItems = totalItems;
        this.onPageChange = onPageChangeCallback;
        this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
        this.currentPage = 1;
        this.renderControls();
    }

    setTotalItems(total) {
        this.totalItems = total;
        this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
        if (this.currentPage > this.totalPages) this.currentPage = this.totalPages || 1;
        this.renderControls();
    }

    getPaginatedItems(items) {
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        return items.slice(start, end);
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this._triggerChange();
        }
    }

    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this._triggerChange();
        }
    }

    goToPage(page) {
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this._triggerChange();
        }
    }

    _triggerChange() {
        this.renderControls();
        if (this.onPageChange) {
            this.onPageChange(this.currentPage);
        }
    }

    renderControls() {
        const container = document.getElementById('pagination-controls');
        if (!container) return;

        container.innerHTML = '';
        if (this.totalPages <= 1) return;

        // Prev Button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary btn-small';
        prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        prevBtn.disabled = this.currentPage === 1;
        prevBtn.onclick = () => this.prevPage();
        container.appendChild(prevBtn);

        // Page Info
        const info = document.createElement('span');
        info.className = 'pagination-info';
        info.textContent = `Página ${this.currentPage} de ${this.totalPages}`;
        container.appendChild(info);

        // Next Button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary btn-small';
        nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        nextBtn.disabled = this.currentPage === this.totalPages;
        nextBtn.onclick = () => this.nextPage();
        container.appendChild(nextBtn);
    }
}

const paginationManager = new PaginationManager();
