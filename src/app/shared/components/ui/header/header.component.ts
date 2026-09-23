import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { MonetizationService } from '../../../../core/services/monetization.service';
import { GlobalSearchService } from '../../../../core/services/global-search.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { ThemeService, ThemeMode } from '../../../../core/services/theme.service';
import { AppLanguageSelectorComponent } from '../language-selector/language-selector.component';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, AppLanguageSelectorComponent, TranslatePipe],
  template: `
    <header class="app-header" [class.is-scrolled]="scrolled">
      <div class="header-inner">
        <!-- 0. Back (mobile, anywhere but the dashboard) -->
        <button
          *ngIf="showBack"
          type="button"
          class="back-btn"
          (click)="goBack()"
          aria-label="Go back">
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.4" fill="none">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>

        <!-- 1. Brand / Logo -->
        <a routerLink="/home" class="brand-link">
          <div class="brand-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-name">Form Helper</span>
            <span class="brand-tag">{{ 'common.brandTag' | translate }}</span>
          </div>
        </a>

        <!-- 2. Desktop Navigation -->
        <nav class="desktop-nav">
          <!-- Tools Dropdown Trigger -->
          <div class="nav-dropdown-wrap">
            <button
              type="button"
              class="nav-item tools-dropdown-btn"
              [class.active]="toolsMenuOpen"
              (click)="toolsMenuOpen = !toolsMenuOpen"
              aria-haspopup="true"
              [attr.aria-expanded]="toolsMenuOpen">
              <span>{{ 'header.tools' | translate }}</span>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.2" fill="none" class="dropdown-chevron">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            <!-- Tools Mega Dropdown Menu -->
            <div *ngIf="toolsMenuOpen" class="tools-dropdown-menu" (click)="toolsMenuOpen = false">
              <div class="dropdown-column">
                <span class="column-title">{{ 'header.columnMedia' | translate }}</span>
                <a routerLink="/features/photo" class="dropdown-item">
                  <span class="item-dot color-photo"></span>
                  <div>
                    <span class="item-name">{{ 'tools.photo_tools.title' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolPhotoSub' | translate }}</span>
                  </div>
                </a>
                <a routerLink="/features/signature" class="dropdown-item">
                  <span class="item-dot color-signature"></span>
                  <div>
                    <span class="item-name">{{ 'tools.signature_tools.title' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolSigSub' | translate }}</span>
                  </div>
                </a>
                <a routerLink="/features/batch" class="dropdown-item">
                  <span class="item-dot color-batch"></span>
                  <div>
                    <span class="item-name">{{ 'tools.batch_images.title' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolBatchSub' | translate }}</span>
                  </div>
                </a>
              </div>

              <div class="dropdown-column">
                <span class="column-title">{{ 'header.columnPdf' | translate }}</span>
                <a routerLink="/features/pdf" class="dropdown-item">
                  <span class="item-dot color-pdf"></span>
                  <div>
                    <span class="item-name">{{ 'header.pdf' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolPdfSub' | translate }}</span>
                  </div>
                </a>
                <a routerLink="/features/pdf/conversion" class="dropdown-item">
                  <span class="item-dot color-convert"></span>
                  <div>
                    <span class="item-name">{{ 'tools.doc_converter.title' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolConvertSub' | translate }}</span>
                  </div>
                </a>
                <a routerLink="/features/pdf/organize" class="dropdown-item">
                  <span class="item-dot color-organize"></span>
                  <div>
                    <span class="item-name">{{ 'tools.pdf_organize.title' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolOrganizeSub' | translate }}</span>
                  </div>
                </a>
              </div>

              <div class="dropdown-column">
                <span class="column-title">{{ 'header.columnEdit' | translate }}</span>
                <a routerLink="/features/pdf/editor" class="dropdown-item">
                  <span class="item-dot color-edit"></span>
                  <div>
                    <span class="item-name">{{ 'tools.pdf_editor.title' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolEditorSub' | translate }}</span>
                  </div>
                </a>
                <a routerLink="/features/pdf/sign" class="dropdown-item">
                  <span class="item-dot color-sign"></span>
                  <div>
                    <span class="item-name">{{ 'tools.sign_pdf.title' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolSignSub' | translate }}</span>
                  </div>
                </a>
                <a routerLink="/features/pdf/security" class="dropdown-item">
                  <span class="item-dot color-security"></span>
                  <div>
                    <span class="item-name">{{ 'tools.pdf_protect.title' | translate }}</span>
                    <span class="item-sub">{{ 'header.toolSecuritySub' | translate }}</span>
                  </div>
                </a>
              </div>
            </div>
          </div>

          <!-- Direct Desktop Links -->
          <a routerLink="/features/pdf" routerLinkActive="active" class="nav-item">{{ 'header.pdf' | translate }}</a>
          <a routerLink="/features/photo" routerLinkActive="active" class="nav-item">{{ 'header.photo' | translate }}</a>
          <a routerLink="/features/signature" routerLinkActive="active" class="nav-item">{{ 'header.signature' | translate }}</a>
          <a routerLink="/features/presets" routerLinkActive="active" class="nav-item">{{ 'header.presets' | translate }}</a>
          <a routerLink="/features/history" routerLinkActive="active" class="nav-item">{{ 'header.history' | translate }}</a>
          <a routerLink="/features/premium" routerLinkActive="active" class="nav-item nav-item-pro">
            <span class="pro-sparkle">&starf;</span>
            <span>{{ 'header.premium' | translate }}</span>
          </a>
        </nav>

        <!-- 3. Header Actions (Desktop & Mobile) -->
        <div class="header-actions">
          <!-- Language Selector Dropdown -->
          <app-language-selector mode="dropdown"></app-language-selector>

          <!-- Search Button (Both Desktop & Mobile) -->
          <button
            type="button"
            class="search-trigger-btn"
            (click)="openSearch()"
            aria-label="Search tools">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span class="search-btn-text">{{ 'common.search' | translate }}</span>
            <kbd class="search-kbd">Ctrl+K</kbd>
          </button>

          <!-- Theme Toggle: light -> dark -> follow system -->
          <button
            type="button"
            class="theme-toggle-btn"
            (click)="cycleTheme()"
            [attr.title]="themeLabel"
            [attr.aria-label]="themeLabel">
            <svg *ngIf="(themeService.currentTheme$ | async) === 'light'" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="theme-glyph">
              <circle cx="12" cy="12" r="4.5"></circle>
              <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"></path>
            </svg>
            <svg *ngIf="(themeService.currentTheme$ | async) === 'dark'" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="theme-glyph">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path>
            </svg>
            <svg *ngIf="(themeService.currentTheme$ | async) === 'system'" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="theme-glyph">
              <rect x="2.5" y="4" width="19" height="12.5" rx="2"></rect>
              <line x1="8.5" y1="20" x2="15.5" y2="20"></line>
              <line x1="12" y1="16.5" x2="12" y2="20"></line>
            </svg>
          </button>

          <!-- Profile: full chip on desktop, avatar only on mobile -->
          <a routerLink="/profile" class="profile-btn" title="User Profile" aria-label="Profile">
            <div class="profile-avatar-chip">
              <img
                *ngIf="(profileService.profile$ | async)?.avatarUrl as avatarUrl"
                [src]="avatarUrl"
                alt=""
                class="avatar-img" />
              <span *ngIf="!(profileService.profile$ | async)?.avatarUrl" class="avatar-initials">
                {{ profileService.getInitials((profileService.profile$ | async)?.displayName || 'User') }}
              </span>
            </div>
            <span class="profile-btn-name">
              {{ (profileService.profile$ | async)?.displayName || 'Profile' }}
            </span>
          </a>

          <!-- Mobile Hamburger Button -->
          <button
            type="button"
            class="mobile-menu-btn"
            [class.is-open]="mobileMenuOpen"
            (click)="toggleMobileMenu()"
            [attr.aria-expanded]="mobileMenuOpen"
            aria-label="Toggle Navigation Menu">
            <span class="burger-bar bar-top"></span>
            <span class="burger-bar bar-mid"></span>
            <span class="burger-bar bar-bot"></span>
          </button>
        </div>
      </div>
    </header>

    <!--
      The drawer lives OUTSIDE .app-header on purpose.

      .app-header carries a backdrop-filter, and a filtered element becomes the
      containing block for its position: fixed descendants. Nested inside it the
      drawer resolved top/right/bottom/left against the 60px-tall bar, so it
      rendered with zero height and the menu looked like it never opened.
      :host is only position: sticky, which does not create that containing
      block, so out here the drawer fills the viewport as intended.
    -->
    <div *ngIf="mobileMenuOpen" class="mobile-drawer" (click)="closeMobileMenu()">
      <div class="mobile-drawer-content" (click)="$event.stopPropagation()">
        <!-- Drawer Header with Profile Card -->
        <div class="drawer-profile-card">
          <a routerLink="/profile" (click)="closeMobileMenu()" class="drawer-profile-link">
            <div class="drawer-avatar">
              <img
                *ngIf="(profileService.profile$ | async)?.avatarUrl as avatarUrl"
                [src]="avatarUrl"
                alt=""
                class="avatar-img" />
              <span *ngIf="!(profileService.profile$ | async)?.avatarUrl" class="avatar-initials">
                {{ profileService.getInitials((profileService.profile$ | async)?.displayName || 'User') }}
              </span>
            </div>
            <div class="drawer-user-info">
              <span class="drawer-user-name">{{ (profileService.profile$ | async)?.displayName || 'Offline User' }}</span>
              <span class="drawer-membership-tag" [class.is-pro]="monetization.isPremium$ | async">
                {{ (monetization.isPremium$ | async) ? 'PRO Member' : 'Free Tier' }}
              </span>
            </div>
          </a>
          <button class="drawer-close" (click)="closeMobileMenu()" aria-label="Close menu">
            &times;
          </button>
        </div>

        <!-- Language switch -->
        <div class="drawer-theme-row">
          <span class="drawer-theme-label">{{ 'common.language' | translate }}</span>
          <app-language-selector mode="dropdown"></app-language-selector>
        </div>

        <!-- Appearance switch -->
        <div class="drawer-theme-row">
          <span class="drawer-theme-label">{{ 'common.appearance' | translate }}</span>
          <div class="theme-segmented" role="group" aria-label="Theme">
            <button
              *ngFor="let option of themeOptions"
              type="button"
              class="theme-seg-btn"
              [class.active]="(themeService.currentTheme$ | async) === option.mode"
              (click)="setTheme(option.mode)">
              {{ ('common.' + option.mode) | translate }}
            </button>
          </div>
        </div>

        <!-- Drawer Navigation Links -->
        <div class="drawer-links">
          <a
            *ngFor="let link of drawerLinks; let i = index"
            [routerLink]="link.route"
            routerLinkActive="is-active"
            (click)="closeMobileMenu()"
            class="drawer-link"
            [class.pro-link]="link.pro"
            [style.--stagger]="i">
            <span class="link-bullet" [ngClass]="link.bullet"></span> {{ link.labelKey | translate }}
          </a>
        </div>

        <!-- Drawer Footer -->
        <div class="drawer-footer">
          <div class="offline-badge">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            <span>{{ 'common.offlineBadge' | translate }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /*
     * The translucent header colour comes from a token rather than a literal so
     * it follows the theme. An ancestor selector such as [data-theme="dark"]
     * .app-header cannot be used here: Angular's emulated encapsulation rewrites
     * it to [data-theme="dark"][_ngcontent-x] .app-header[_ngcontent-x], and the
     * html element never carries the content attribute, so the rule never
     * matched and the header rendered white-on-white in dark mode.
     */
    /*
     * The stickiness lives on the host, not on the inner <header>.
     *
     * A sticky element can only travel within its own parent's box. The host
     * element is exactly as tall as the header, so making the inner <header>
     * sticky gave it zero room to move and it scrolled away with the page. The
     * host is a direct child of the scrolling .app-page-wrapper, so sticking it
     * there pins the bar for the whole scroll range.
     */
    :host {
      --header-height: 60px;
      display: block;
      position: sticky;
      top: 0;
      z-index: var(--z-header, 1000);
    }

    .app-header {
      background-color: var(--header-surface);
      border-bottom: 1px solid var(--color-border);
      backdrop-filter: saturate(180%) blur(12px);
      -webkit-backdrop-filter: saturate(180%) blur(12px);
      transition: box-shadow var(--transition-normal), background-color var(--transition-normal);
    }

    .app-header.is-scrolled {
      box-shadow: var(--shadow-md);
    }

    .header-inner {
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 var(--space-4, 16px);
      height: var(--header-height);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3, 12px);
    }

    .back-btn {
      display: none;
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md, 10px);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text);
      cursor: pointer;
      transition: transform var(--transition-fast), background-color var(--transition-fast);
    }

    .back-btn:hover {
      background-color: var(--color-background-subtle);
    }

    .back-btn:active {
      transform: translateX(-2px) scale(0.94);
    }

    .brand-link {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--color-text);
      flex-shrink: 0;
      min-width: 0;
    }

    .brand-icon {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-md, 10px);
      background: var(--gradient-brand);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px -2px rgba(99, 102, 241, 0.45);
      transition: transform var(--transition-normal);
    }

    .brand-link:hover .brand-icon {
      transform: translateY(-1px) rotate(-4deg);
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .brand-name {
      font-size: var(--font-h3, 18px);
      font-weight: var(--font-weight-bold, 700);
      letter-spacing: -0.02em;
      line-height: 1.1;
      white-space: nowrap;
    }

    .brand-tag {
      font-size: 10px;
      font-weight: var(--font-weight-semibold, 600);
      color: var(--color-success);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .desktop-nav {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .nav-item {
      position: relative;
      padding: 6px 11px;
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-text-secondary);
      text-decoration: none;
      border-radius: var(--radius-sm, 6px);
      transition: all var(--transition-fast, 150ms);
      background: transparent;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .nav-item:hover {
      color: var(--color-text);
      background-color: var(--color-background-subtle);
    }

    /* Underline that grows from the centre on hover and stays for the active route. */
    .nav-item::after {
      content: '';
      position: absolute;
      left: 11px;
      right: 11px;
      bottom: 1px;
      height: 2px;
      border-radius: var(--radius-full);
      background: var(--color-primary);
      transform: scaleX(0);
      transition: transform var(--transition-fast);
    }

    .nav-item:hover::after {
      transform: scaleX(0.6);
    }

    .nav-item.active {
      color: var(--color-primary);
      background-color: var(--color-primary-soft);
      font-weight: var(--font-weight-semibold, 600);
    }

    .nav-item.active::after {
      transform: scaleX(1);
    }

    .nav-item-pro {
      color: var(--color-warning);
      font-weight: var(--font-weight-semibold, 600);
    }
    .pro-sparkle {
      font-size: 14px;
    }

    /* Tools Dropdown */
    .nav-dropdown-wrap {
      position: relative;
    }

    .tools-dropdown-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .dropdown-chevron {
      transition: transform var(--transition-fast, 150ms);
    }
    .tools-dropdown-btn.active .dropdown-chevron {
      transform: rotate(180deg);
    }

    .tools-dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      margin-top: 8px;
      width: 600px;
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl, 16px);
      box-shadow: var(--shadow-modal);
      padding: var(--space-4, 16px);
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-4, 16px);
      z-index: var(--z-dropdown);
      transform-origin: top left;
      animation: dropdownIn var(--transition-normal) cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes dropdownIn {
      from { opacity: 0; transform: translateY(-8px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .dropdown-column {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .column-title {
      font-size: 11px;
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
      margin-bottom: 6px;
      padding-left: 6px;
    }

    .dropdown-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--radius-md, 8px);
      text-decoration: none;
      color: var(--color-text);
      transition: background-color var(--transition-fast, 150ms), transform var(--transition-fast);
    }

    .dropdown-item:hover {
      background-color: var(--color-background-subtle);
      transform: translateX(3px);
    }

    .item-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 5px;
      flex-shrink: 0;
    }

    .item-name {
      display: block;
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-semibold, 600);
      line-height: 1.2;
    }

    .item-sub {
      display: block;
      font-size: 11px;
      color: var(--color-text-secondary);
      line-height: 1.2;
      margin-top: 2px;
    }

    .color-photo { background: var(--color-photo); }
    .color-signature { background: var(--color-signature); }
    .color-pdf { background: var(--color-pdf); }
    .color-convert { background: var(--color-convert); }
    .color-organize { background: var(--color-organize); }
    .color-edit { background: var(--color-edit); }
    .color-sign { background: var(--color-sign); }
    .color-security { background: var(--color-security); }
    .color-batch { background: var(--color-batch); }

    /* Header Actions */
    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .search-trigger-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 12px;
      border-radius: var(--radius-md, 10px);
      background-color: var(--color-background-subtle);
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      font-size: var(--font-small, 13px);
      cursor: pointer;
      transition: all var(--transition-fast, 150ms);
    }

    .search-trigger-btn:hover {
      background-color: var(--color-surface-hover);
      border-color: var(--color-border-hover);
      color: var(--color-text);
    }

    .search-trigger-btn:active {
      transform: scale(0.96);
    }

    .search-kbd {
      font-size: 10px;
      font-family: inherit;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xs, 4px);
      padding: 1px 5px;
      color: var(--color-text-muted);
    }

    .theme-toggle-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      border-radius: var(--radius-md, 10px);
      border: 1px solid var(--color-border);
      background-color: var(--color-surface);
      color: var(--color-text-secondary);
      cursor: pointer;
      overflow: hidden;
      transition: all var(--transition-fast, 150ms);
    }

    .theme-toggle-btn:hover {
      color: var(--color-text);
      border-color: var(--color-border-hover);
      background-color: var(--color-background-subtle);
    }

    .theme-toggle-btn:active {
      transform: scale(0.92);
    }

    /* Each mode swaps a different glyph in; the spin sells it as one control. */
    .theme-glyph {
      animation: themeGlyphIn var(--transition-normal) cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes themeGlyphIn {
      from { opacity: 0; transform: rotate(-90deg) scale(0.5); }
      to { opacity: 1; transform: rotate(0) scale(1); }
    }

    .profile-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 10px 0 4px;
      border-radius: var(--radius-full, 9999px);
      border: 1px solid var(--color-border);
      background-color: var(--color-surface);
      text-decoration: none;
      color: var(--color-text);
      flex-shrink: 0;
      transition: all var(--transition-fast, 150ms);
    }

    .profile-btn:hover {
      border-color: var(--color-border-hover);
      background-color: var(--color-background-subtle);
    }

    .profile-btn:active {
      transform: scale(0.96);
    }

    .profile-avatar-chip {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--gradient-brand);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      overflow: hidden;
      flex-shrink: 0;
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .profile-btn-name {
      font-size: var(--font-small, 13px);
      font-weight: var(--font-weight-medium, 500);
      max-width: 100px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-menu-btn {
      display: none;
      position: relative;
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      border-radius: var(--radius-md, 10px);
      border: 1px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-text);
      cursor: pointer;
      padding: 0;
    }

    /* Three bars that fold into an X rather than swapping icons outright. */
    .burger-bar {
      position: absolute;
      left: 9px;
      width: 16px;
      height: 2px;
      border-radius: 2px;
      background: currentColor;
      transition: transform var(--transition-normal), opacity var(--transition-fast);
    }
    .bar-top { top: 12px; }
    .bar-mid { top: 17px; }
    .bar-bot { top: 22px; }

    .mobile-menu-btn.is-open .bar-top { transform: translateY(5px) rotate(45deg); }
    .mobile-menu-btn.is-open .bar-mid { opacity: 0; transform: scaleX(0.3); }
    .mobile-menu-btn.is-open .bar-bot { transform: translateY(-5px) rotate(-45deg); }

    /* Mobile Drawer */
    .mobile-drawer {
      position: fixed;
      top: var(--header-height);
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--scrim);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: var(--z-drawer);
      display: flex;
      justify-content: flex-end;
      animation: drawerScrimIn var(--transition-normal) ease-out;
    }

    @keyframes drawerScrimIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .mobile-drawer-content {
      width: 320px;
      max-width: 85%;
      height: 100%;
      background-color: var(--color-surface);
      box-shadow: var(--shadow-modal);
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      animation: drawerSlideIn var(--transition-normal) cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes drawerSlideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    .drawer-profile-card {
      padding: var(--space-4, 16px);
      border-bottom: 1px solid var(--color-divider);
      display: flex;
      align-items: center;
      justify-content: space-between;
      background-color: var(--color-background-subtle);
    }

    .drawer-profile-link {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--color-text);
      flex: 1;
      min-width: 0;
    }

    .drawer-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--gradient-brand);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      overflow: hidden;
      flex-shrink: 0;
    }

    .drawer-user-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .drawer-user-name {
      font-size: var(--font-label, 14px);
      font-weight: var(--font-weight-semibold, 600);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .drawer-membership-tag {
      font-size: 10px;
      font-weight: 700;
      color: var(--color-text-muted);
      text-transform: uppercase;
    }
    .drawer-membership-tag.is-pro {
      color: var(--color-warning);
    }

    .drawer-close {
      background: transparent;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: var(--color-text-secondary);
      line-height: 1;
    }

    .drawer-theme-row {
      padding: var(--space-3, 12px) var(--space-4, 16px);
      border-bottom: 1px solid var(--color-divider);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3, 12px);
    }

    .drawer-theme-label {
      font-size: var(--font-caption, 12px);
      font-weight: var(--font-weight-semibold, 600);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }

    .theme-segmented {
      display: inline-flex;
      padding: 2px;
      gap: 2px;
      border-radius: var(--radius-full, 9999px);
      background-color: var(--color-surface-sunken);
      border: 1px solid var(--color-border);
    }

    .theme-seg-btn {
      border: none;
      background: transparent;
      color: var(--color-text-secondary);
      font-size: 11px;
      font-weight: var(--font-weight-semibold, 600);
      font-family: inherit;
      padding: 5px 10px;
      border-radius: var(--radius-full, 9999px);
      cursor: pointer;
      transition: all var(--transition-fast, 150ms);
    }

    .theme-seg-btn.active {
      background-color: var(--color-primary);
      color: var(--color-primary-contrast);
    }

    .drawer-links {
      flex: 1;
      padding: var(--space-3, 12px) var(--space-2, 8px);
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .drawer-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      font-size: var(--font-body, 14px);
      color: var(--color-text);
      text-decoration: none;
      border-radius: var(--radius-md, 10px);
      transition: background-color var(--transition-fast, 150ms), transform var(--transition-fast);
      /* Links fan in one after another as the panel settles. */
      animation: drawerLinkIn var(--transition-normal) both cubic-bezier(0.16, 1, 0.3, 1);
      animation-delay: calc(var(--stagger, 0) * 28ms + 80ms);
    }

    @keyframes drawerLinkIn {
      from { opacity: 0; transform: translateX(18px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .drawer-link:hover {
      background-color: var(--color-background-subtle);
      transform: translateX(3px);
    }

    .drawer-link.is-active {
      background-color: var(--color-primary-soft);
      color: var(--color-primary);
      font-weight: var(--font-weight-semibold, 600);
    }

    .drawer-link.pro-link {
      color: var(--color-warning);
      font-weight: var(--font-weight-semibold, 600);
    }

    .link-bullet {
      width: 8px;
      height: 8px;
      border-radius: var(--radius-full, 9999px);
      background-color: var(--color-border-hover);
      flex-shrink: 0;
    }
    .bullet-photo { background-color: var(--color-photo); }
    .bullet-sig { background-color: var(--color-signature); }
    .bullet-pdf { background-color: var(--color-pdf); }
    .bullet-convert { background-color: var(--color-convert); }
    .bullet-organize { background-color: var(--color-organize); }
    .bullet-edit { background-color: var(--color-edit); }
    .bullet-presets { background-color: var(--color-presets); }
    .bullet-pro { background: var(--gradient-premium); }

    .drawer-footer {
      padding: var(--space-4, 16px);
      border-top: 1px solid var(--color-divider);
      background-color: var(--color-background-subtle);
    }

    .offline-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--font-caption, 12px);
      font-weight: var(--font-weight-medium, 500);
      color: var(--color-success);
    }

    @media (max-width: 960px) {
      .desktop-nav, .search-kbd, .search-btn-text, .profile-btn-name {
        display: none !important;
      }
      .back-btn {
        display: inline-flex;
      }
      .mobile-menu-btn {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
      }
      .search-trigger-btn {
        width: 36px;
        padding: 0;
        justify-content: center;
      }
      .profile-btn {
        width: 36px;
        padding: 0;
        justify-content: center;
      }
      .header-actions {
        gap: 6px;
      }
    }

    @media (max-width: 768px) {
      /* Theme toggle and Profile button are redundant in top bar because both
         are prominently featured at the very top of the mobile drawer */
      .theme-toggle-btn {
        display: none !important;
      }
      .profile-btn {
        display: none !important;
      }
      .brand-tag {
        display: none;
      }
      .header-inner {
        padding: 0 12px;
        gap: 8px;
      }
      .mobile-menu-btn {
        display: inline-flex !important;
        flex-shrink: 0 !important;
      }
    }

    @media (max-width: 480px) {
      .header-inner {
        padding: 0 8px;
        gap: 6px;
      }
      .brand-link {
        gap: 6px;
      }
      .brand-icon {
        width: 32px;
        height: 32px;
      }
      .brand-icon svg {
        width: 18px;
        height: 18px;
      }
      .brand-name {
        font-size: 15px;
      }
      .back-btn,
      .search-trigger-btn,
      .mobile-menu-btn {
        width: 34px;
        height: 34px;
      }
      .burger-bar {
        left: 8px;
        width: 16px;
      }
      .bar-top { top: 11px; }
      .bar-mid { top: 16px; }
      .bar-bot { top: 21px; }
    }

    @media (max-width: 360px) {
      .brand-name {
        max-width: 80px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13.5px;
      }
    }
  `]
})
export class AppHeaderComponent implements OnInit, OnDestroy {
  mobileMenuOpen = false;
  toolsMenuOpen = false;

  /** Drives the compact/elevated header treatment once the page scrolls. */
  scrolled = false;

  /** The mobile back affordance is pointless on the dashboard itself. */
  showBack = false;

  readonly themeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: 'light', label: 'Light' },
    { mode: 'dark', label: 'Dark' },
    { mode: 'system', label: 'Auto' }
  ];

  /*
   * The drawer used to repeat the same anchor twelve times. Driving it from
   * data keeps the markup to one *ngFor and makes the stagger index free.
   */
  readonly drawerLinks: { route: string; labelKey: string; bullet: string; pro?: boolean }[] = [
    { route: '/home', labelKey: 'header.tools', bullet: '' },
    { route: '/features/pdf', labelKey: 'tools.pdf_dashboard.title', bullet: 'bullet-pdf' },
    { route: '/features/photo', labelKey: 'tools.photo_tools.title', bullet: 'bullet-photo' },
    { route: '/features/signature', labelKey: 'tools.signature_tools.title', bullet: 'bullet-sig' },
    { route: '/features/presets', labelKey: 'tools.presets.title', bullet: 'bullet-presets' },
    { route: '/features/pdf/conversion', labelKey: 'tools.doc_converter.title', bullet: 'bullet-convert' },
    { route: '/features/pdf/organize', labelKey: 'tools.pdf_organize.title', bullet: 'bullet-organize' },
    { route: '/features/pdf/editor', labelKey: 'tools.pdf_editor.title', bullet: 'bullet-edit' },
    { route: '/features/history', labelKey: 'header.history', bullet: '' },
    { route: '/features/premium', labelKey: 'header.premium', bullet: 'bullet-pro', pro: true },
    { route: '/profile', labelKey: 'common.profile', bullet: '' },
    { route: '/features/settings', labelKey: 'settings.title', bullet: '' }
  ];

  private routerSub?: Subscription;

  constructor(
    public monetization: MonetizationService,
    public globalSearch: GlobalSearchService,
    public profileService: ProfileService,
    public themeService: ThemeService,
    private router: Router,
    private location: Location,
    private host: ElementRef<HTMLElement>,
    private cdr: ChangeDetectorRef
  ) {}

  get themeLabel(): string {
    const mode = this.themeService.currentTheme$.value;
    const next = mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light';
    return `Theme: ${mode} — switch to ${next}`;
  }

  /*
   * The page scrolls inside `.app-page-wrapper`, not the window — Ionic pins
   * <body>. Scroll events do not bubble, so this listens in the capture phase
   * on the document to catch them from whichever element is actually scrolling.
   */
  private readonly onAnyScroll = (event: Event) => {
    const target = event.target as HTMLElement | Document | null;
    const offset =
      target && target instanceof HTMLElement
        ? target.scrollTop
        : window.scrollY || document.documentElement.scrollTop || 0;
    const next = offset > 8;
    if (next !== this.scrolled) {
      this.scrolled = next;
      this.cdr.markForCheck();
    }
  };

  ngOnInit() {
    document.addEventListener('scroll', this.onAnyScroll, true);

    this.syncBackVisibility(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => {
        this.syncBackVisibility(e.urlAfterRedirects);
        // A route change from inside the drawer should never leave it hanging.
        this.closeMobileMenu();
        this.toolsMenuOpen = false;
      });
  }

  private syncBackVisibility(url: string) {
    const path = (url || '').split('?')[0].split('#')[0];
    const next = path !== '/home' && path !== '/';
    if (next !== this.showBack) {
      this.showBack = next;
      this.cdr.markForCheck();
    }
  }

  goBack() {
    /*
     * A deep link opened straight into the app has nothing behind it, so
     * Location.back() would walk out of the app. Fall back to the dashboard.
     */
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigateByUrl('/home');
    }
  }

  cycleTheme() {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    const current = this.themeService.currentTheme$.value;
    const next = order[(order.indexOf(current) + 1) % order.length];
    this.setTheme(next);
  }

  setTheme(mode: ThemeMode) {
    void this.themeService.setTheme(mode);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!event.target) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.nav-dropdown-wrap')) {
      this.toolsMenuOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.toolsMenuOpen = false;
    this.closeMobileMenu();
  }

  toggleMobileMenu() {
    this.mobileMenuOpen ? this.closeMobileMenu() : this.openMobileMenu();
  }

  openMobileMenu() {
    this.mobileMenuOpen = true;
    this.setPageScrollLocked(true);
  }

  closeMobileMenu() {
    if (!this.mobileMenuOpen) return;
    this.mobileMenuOpen = false;
    this.setPageScrollLocked(false);
  }

  /** Stops the page behind the drawer from scrolling with it. */
  private setPageScrollLocked(locked: boolean) {
    /*
     * The scroll container is the routed host (`ion-router-outlet > .ion-page`,
     * see global.scss), which is an ancestor of the shell wrapper. Locking the
     * wrapper alone did nothing on the pages that have no wrapper at all.
     */
    const scroller =
      (this.host.nativeElement.closest('.ion-page') as HTMLElement | null) ??
      (this.host.nativeElement.closest('.app-page-wrapper') as HTMLElement | null);
    if (scroller) {
      scroller.style.overflowY = locked ? 'hidden' : '';
    }
  }

  ngOnDestroy() {
    document.removeEventListener('scroll', this.onAnyScroll, true);
    this.routerSub?.unsubscribe();
    this.setPageScrollLocked(false);
  }

  openSearch() {
    this.globalSearch.open();
  }
}
