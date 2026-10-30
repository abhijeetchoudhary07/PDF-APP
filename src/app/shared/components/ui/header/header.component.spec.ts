import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { AppHeaderComponent } from './header.component';
import { GlobalSearchService } from '../../../../core/services/global-search.service';
import { ThemeService } from '../../../../core/services/theme.service';
import { TranslationService } from '../../../../core/services/translation.service';

describe('AppHeaderComponent', () => {
  let fixture: ComponentFixture<AppHeaderComponent>;
  let component: AppHeaderComponent;
  let searchService: GlobalSearchService;
  let themeService: ThemeService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppHeaderComponent],
      providers: [
        provideRouter([]),
        GlobalSearchService,
        ThemeService,
        TranslationService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppHeaderComponent);
    component = fixture.componentInstance;
    searchService = TestBed.inject(GlobalSearchService);
    themeService = TestBed.inject(ThemeService);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('should create the header component', () => {
    expect(component).toBeTruthy();
  });

  it('should render clean single header without secondary rail', () => {
    const railWrap = fixture.nativeElement.querySelector('.header-nav-rail-wrap');
    expect(railWrap).toBeNull();

    const brandLink = fixture.nativeElement.querySelector('.brand-link');
    expect(brandLink).toBeTruthy();

    const searchBtn = fixture.nativeElement.querySelector('.search-trigger-btn');
    expect(searchBtn).toBeTruthy();

    const mobileMenuBtn = fixture.nativeElement.querySelector('.mobile-menu-btn');
    expect(mobileMenuBtn).toBeTruthy();
  });

  it('should trigger search modal when search trigger button is clicked', () => {
    const searchSpy = vi.spyOn(searchService, 'open');
    const searchBtn = fixture.nativeElement.querySelector('.search-trigger-btn');
    expect(searchBtn).toBeTruthy();

    searchBtn.click();
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it('should cycle theme through light -> dark -> system', () => {
    themeService.currentTheme$.next('light');
    const setThemeSpy = vi.spyOn(themeService, 'setTheme');

    component.cycleTheme();
    expect(setThemeSpy).toHaveBeenCalledWith('dark');

    themeService.currentTheme$.next('dark');
    component.cycleTheme();
    expect(setThemeSpy).toHaveBeenCalledWith('system');

    themeService.currentTheme$.next('system');
    component.cycleTheme();
    expect(setThemeSpy).toHaveBeenCalledWith('light');
  });

  it('should open and close the mobile navigation drawer', async () => {
    expect(component.mobileMenuOpen).toBe(false);

    component.toggleMobileMenu();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.mobileMenuOpen).toBe(true);

    const drawer = fixture.nativeElement.querySelector('.mobile-drawer');
    expect(drawer).toBeTruthy();

    component.closeMobileMenu();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.mobileMenuOpen).toBe(false);
  });

  it('should show back button when showBack is true and call goBack on click', () => {
    component.showBack = true;
    fixture.detectChanges();

    const backBtn = fixture.nativeElement.querySelector('.back-btn');
    expect(backBtn).toBeTruthy();

    const goBackSpy = vi.spyOn(component, 'goBack');
    backBtn.click();
    expect(goBackSpy).toHaveBeenCalled();
  });

  it('should render dedicated mobile options rail with all navigation options', () => {
    const railWrapper = fixture.nativeElement.querySelector('.header-rail-wrapper');
    expect(railWrapper).toBeTruthy();

    const rail = fixture.nativeElement.querySelector('.header-nav-rail');
    expect(rail).toBeTruthy();

    // Verify all navigation options are present in the rail
    const railItems = rail.querySelectorAll('.rail-item');
    expect(railItems.length).toBeGreaterThanOrEqual(7);

    // Tools dropdown trigger button
    const toolsBtn = rail.querySelector('.tools-dropdown-btn');
    expect(toolsBtn).toBeTruthy();

    // Direct link routes in rail
    const links = Array.from(rail.querySelectorAll('a.rail-item')).map((a: any) => a.getAttribute('routerLink') || a.getAttribute('href'));
    expect(links).toContain('/features/pdf');
    expect(links).toContain('/features/photo');
    expect(links).toContain('/features/signature');
    expect(links).toContain('/features/presets');
    expect(links).toContain('/features/history');
    expect(links).toContain('/features/premium');
  });

  it('should toggle tools menu when tools button in rail is clicked', () => {
    expect(component.toolsMenuOpen).toBe(false);

    const rail = fixture.nativeElement.querySelector('.header-nav-rail');
    const toolsBtn = rail.querySelector('.tools-dropdown-btn');
    expect(toolsBtn).toBeTruthy();

    toolsBtn.click();
    fixture.detectChanges();
    expect(component.toolsMenuOpen).toBe(true);

    toolsBtn.click();
    fixture.detectChanges();
    expect(component.toolsMenuOpen).toBe(false);
  });

  it('should call scrollActiveRailItemIntoView on route navigation', () => {
    const scrollSpy = vi.spyOn(component, 'scrollActiveRailItemIntoView');
    component.scrollActiveRailItemIntoView();
    expect(scrollSpy).toHaveBeenCalled();
  });
});
