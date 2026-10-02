import { configure } from '@testing-library/react';

// Pages are lazy-loaded chunks. Under a full parallel run, the first render can take
// longer than testing-library's 1 s default for findBy*/waitFor, so allow 3 s.
configure({ asyncUtilTimeout: 3000 });

// jsdom has <dialog> but not showModal()/close(). Modal relies on them, so give tests a minimal version.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
