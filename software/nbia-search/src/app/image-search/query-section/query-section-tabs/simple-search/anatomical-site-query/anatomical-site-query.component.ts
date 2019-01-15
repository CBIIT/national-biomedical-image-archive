import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonService } from '@app/image-search/services/common.service';
import { Consts } from '@app/consts';
import { ApiServerService } from '@app/image-search/services/api-server.service';
import { SearchResultsSortService } from '@app/image-search/data-section/data-section-tabs/search-results/search-results-sort.service';
import { Properties } from '@assets/properties';
import { InitMonitorService } from '@app/common/services/init-monitor.service';
import { ParameterService } from '@app/common/services/parameter.service';
import { QueryUrlService } from '@app/image-search/query-url/query-url.service';
import { Subject } from 'rxjs';
import { UtilService } from '@app/common/services/util.service';


/**
 * The list of selectable criteria that make up the AnatomicalSite part of the search query.
 */
@Component( {
    selector: 'nbia-anatomical-site-query',
    templateUrl: './anatomical-site-query.component.html',
    styleUrls: ['../../../../../app.component.scss', '../simple-search.component.scss']
} )

export class AnatomicalSiteQueryComponent implements OnInit, OnDestroy{

    /**
     * The list used by the HTML.
     */
    criteriaList;

    /**
     * Used by the UI search within this criteria list (with the red magnifying glass), NOT the data search.
     */
    criteriaListHold;
    resetFlag = true;

    /**
     * For hide or show this group of criteria when the arrows next to the heading are clicked.
     */
    showCriteriaList;

    /**
     * For the 'X More' and 'Less...' in the list of criteria.
     *
     * @type {boolean}
     */
    showAll = false;

    /**
     * Used in the HTML when calculating how many criteria to display.  Checked criteria are always shown.
     */
    unCheckedCount;

    /**
     * Used in the HTML when calculating how many criteria to display.  Checked criteria are always shown.
     */
    checkedCount;

    /**
     * Tracks which criteria have been selected, used in the code, and the HTML.
     *
     * @type {Array}
     */
    cBox = [];

    /**
     * Used by the UI search within this criteria list (with the red magnifying glass), NOT the data search.
     *
     * @type {boolean}
     */
    searchHasFocus = false;
    searchXHasFocus = false;
    searchTextHasFocus = false;
    searchInput = '';

    searchToolTip = 'Search';
    showSearch = false;

    /**
     * The full original Criteria list from the server.
     * Ex.:
     * [
     *     {
     *         "criteria":"4D-Lung",
     *         "count":"20"
     *     },
     *     {
     *         "criteria":"BREAST-DIAGNOSIS",
     *         "count":"88"
     *     },...
     * ]
     */
    completeCriteriaList;
    completeCriteriaListHold = null;

    /**
     * If a query passed in the URL has criteria that don't exist in our current list, they are put in the array, used to alert the user.
     *
     * @type {any[]}
     */
    missingCriteria = [];

    /**
     * To make visible to the HTML.
     *
     * @type {number}
     */
    properties = Properties;

    /**
     * Used to clean up subscribes on the way out to prevent memory leak.
     * @type {Subject<boolean>}
     */
    private ngUnsubscribe: Subject<boolean> = new Subject<boolean>();

    constructor( private commonService: CommonService, private apiServerService: ApiServerService,
                 private sortService: SearchResultsSortService, private parameterService: ParameterService,
                 private initMonitorService: InitMonitorService, private queryUrlService: QueryUrlService,
                 private utilService: UtilService ) {
    }

    async ngOnInit() {

        /**
         * Set to true when a sbuscribe returns an error.
         * It is used where we are waiting on subscribed data, to tell us to stop waiting, there will be no data.
         *
         * @type {boolean}
         */
        let errorFlag = false;

        // ------------------------------------------------------------------------------------------
        // Get the full complete criteria list.
        // ------------------------------------------------------------------------------------------
        this.apiServerService.getBodyPartValuesAndCountsEmitter.takeUntil( this.ngUnsubscribe ).subscribe(
            data => {

                this.completeCriteriaList = data;

                // If completeCriteriaListHold is null, this is the initial call.
                // completeCriteriaListHold lets us reset completeCriteriaList when ever needed.
                if( this.completeCriteriaListHold === null ){
                    this.completeCriteriaListHold = this.utilService.copyCriteriaObjectArray( this.completeCriteriaList );
                }

                // There is no query (anymore) reset the list of criteria to the initial original values.
                else if( this.apiServerService.getSimpleSearchQueryHold() === null ){
                    this.completeCriteriaList = this.utilService.copyCriteriaObjectArray( this.completeCriteriaListHold );
                }
            }
        );

        // React to errors when getting the full complete criteria list.
        this.apiServerService.getBodyPartValuesAndCountsErrorEmitter.takeUntil( this.ngUnsubscribe ).subscribe(
            ( err ) => {
                errorFlag = true;
                // TODO these errors need to be vetted, some are harmless, and shouldn't interrupt the UI flow
                // alert('error: ' + err);
            }
        );

        // This call is to trigger populating this.completeCriteriaList (above) and wait for the results.
        // Note that this is not in the .subscribe and will run when ngOnInit is called.
        this.apiServerService.dataGet( 'getBodyPartValuesAndCounts', '' );
        while( (this.utilService.isNullOrUndefined( this.completeCriteriaList )) && (!errorFlag) ){
            await this.commonService.sleep( Consts.waitTime );
        }
        // ------------------------------------------------------------------------------------------


        // When the number of search results changes. data is the search results count
        // If data equals -1 there is no search, so no results.
        // If data equals 0 there is a search, but no search results.
        // If there is a search, but no search results, all counts are zeroed
        this.commonService.searchResultsCountEmitter.takeUntil( this.ngUnsubscribe ).subscribe(
            data => {
                if( this.commonService.getResultsDisplayMode() === Consts.SIMPLE_SEARCH ){
                    // data  0 = No results from a search,  -1 = No search

                    // If a Simple Search returned no results
                    if( data === 0 ){
                        for( let completeCriteria of this.criteriaList ){
                            completeCriteria.count = 0;
                        }
                    }

                    // No search, restore criteria and counts to their original state.
                    else if( data === -1 ){
                        this.onAnatomicalSiteClearAllClick( true );
                    }
                }
            }
        );


        // When counts of occurrences in the search results changes
        this.apiServerService.criteriaCountUpdateEmitter.takeUntil( this.ngUnsubscribe ).subscribe(
            data => {
                this.onCriteriaCountsChange( data );
            }
        );


        // Reload the list of search criteria because a user has logged in,
        // they may have different access to available search criteria.
        this.commonService.resetAllSimpleSearchForLoginEmitter.takeUntil( this.ngUnsubscribe ).subscribe(
            async() => {
                // This is used when a query included in the URL is to be rerun when a user logs in,
                // so the query knows not to rerun until all the search criteria are set. @see LoginComponent.

                this.initMonitorService.setAtomicalSiteRunning( true );

                // The complete reset we need.
                this.resetFlag = true;
                this.completeCriteriaList = null;

                // Get the list of all Anatomical Sites in the database and the number of records which contain each Anatomical Site.
                this.apiServerService.dataGet( 'getBodyPartValuesAndCounts', '' );
                while( (this.utilService.isNullOrUndefined( this.completeCriteriaList )) && (!errorFlag) ){
                    await this.commonService.sleep( Consts.waitTime );
                }
                this.completeCriteriaListHold = this.utilService.copyCriteriaObjectArray( this.completeCriteriaList );

                // Was there a search passed in with the URL
                if( this.parameterService.haveUrlSimpleSearchParameters() ){
                    this.setInitialCriteriaList();
                    this.updateCheckboxCount();
                }
                else{
                    this.resetAll();
                }
                this.initMonitorService.setAtomicalSiteRunning( false );
            }
        );


        // Called when the "Clear" button on the left side of the Display query at the top.
        this.commonService.resetAllSimpleSearchEmitter.takeUntil( this.ngUnsubscribe ).subscribe(
            () => {
                this.completeCriteriaList = this.utilService.copyCriteriaObjectArray( this.completeCriteriaListHold );
            }
        );


        // Called when a query included in the URL contained one or more Anatomical sites.
        this.parameterService.parameterAnatomicalSiteEmitter.takeUntil( this.ngUnsubscribe ).subscribe(
            data => {
                // Deal with trailing (wrong) comma
                data = (<any>data).replace( /,$/, '' );

                // Data can be multiple values, comma separated
                let criteriaListQueryList = (<any>data).split( /\s*,\s*/ );

                // If we don't have one or more of the Anatomical sites that where included in the query, add them to this.missingCriteria.
                // We will use this list later to tell the user they don't have access to everything they are trying to query.
                this.missingCriteria = [];
                for( let criteriaQuery of criteriaListQueryList ){
                    let found = false;

                    // Look at each available criteria
                    for( let f = 0; f < this.criteriaList.length; f++ ){
                        if( criteriaQuery.toUpperCase() === this.criteriaList[f].criteria.toUpperCase() ){
                            found = true;
                            this.onCheckboxClick( f, true );
                            this.commonService.setHaveUserInput( false );
                        }
                    }

                    // If one or more of the criteria we are trying to check/select is not in the list of available criteria.
                    if( !found ){
                        this.missingCriteria.push( 'Anatomical Site: \"' + criteriaQuery + '\" is not available.' );
                    }
                }

                if( this.missingCriteria.length > 0 ){
                    // Each search category ( Collections, Image Modality, Anatomical Sites ) adds to the over all list with this call
                    this.commonService.updateMissingCriteriaArray( this.missingCriteria );
                }

                // (Re)sort the list because a checked criteria is higher than unchecked.
                this.criteriaList = this.sortService.criteriaSort( this.criteriaList, this.cBox );
                this.setSequenceValue();

            } );


        // ------ END of subscribes ------


        // Gets the list of Anatomical Sites to be used as selectable search criteria in the 'Anatomical Site' criteria panel in the Query section.
        this.setInitialCriteriaList();

        if( !this.utilService.isNullOrUndefined( this.criteriaList ) ){
            this.unCheckedCount = this.criteriaList.length;
        }
        else{
            this.unCheckedCount = 0;
        }

        // Get persisted showCriteriaList value.  Used to show, or collapse this category of criteria in the UI.
        this.showCriteriaList = this.commonService.getCriteriaQueryShow( Consts.SHOW_CRITERIA_QUERY_ANATOMICAL_SITE );
        if( this.utilService.isNullOrUndefined( this.showCriteriaList ) ){
            this.showCriteriaList = Consts.SHOW_CRITERIA_QUERY_ANATOMICAL_SITE_DEFAULT;
            this.commonService.setCriteriaQueryShow( Consts.SHOW_CRITERIA_QUERY_ANATOMICAL_SITE, this.showCriteriaList );
        }

    } // End ngOnInit


    /**
     * Adds this category of search criteria to the query that the QueryUrlService will provide for "Share" -> "Share my query"
     */
    sendSelectedCriteriaString() {
        let criteriaString = '';
        for( let f = 0; f < this.cBox.length; f++ ){
            if( this.cBox[f] ){
                if( f > 0 ){
                    criteriaString += ',';
                }
                criteriaString += this.criteriaList[f]['criteria'];
            }
        }
        this.queryUrlService.update( this.queryUrlService.ANATOMICAL_SITE, criteriaString );
    }


    /**
     * Updates, sort, etc... This category when the counts change.
     *
     * @param data
     * @returns {Promise<void>}  Don't need this.
     */
    async onCriteriaCountsChange( data ) {
        if( (this.utilService.isNullOrUndefined( data.res )) || (data.res.length < 1) ){
            return;
        }

        // Find our (Anatomical Site) data
        let anatomicalSiteCriteriaObj;

        // data.res is an array of Objects,  each object is one criteria's data.
        for( let criteria of data.res ){
            if( criteria.criteria === 'Anatomical Site' ){
                anatomicalSiteCriteriaObj = criteria.values;
            }
        }

        // Before we update the list, save the original list so we can restore checkboxes by criteria name.
        let criteriaListTemp = this.criteriaList;

        let cBoxHold = [];
        // Before we update the criteria list, save all the checked boxes.
        for( let f = 0; f < this.cBox.length; f++ ){
            cBoxHold[f] = this.cBox[f];
        }


        // If there is no query just reset criteriaList to criteriaListHold.
        if( this.apiServerService.getSimpleSearchQueryHold() === null ){
            this.criteriaList = this.criteriaListHold;
            this.setInitialCriteriaList();
        }
        else if( !this.utilService.isNullOrUndefined( anatomicalSiteCriteriaObj ) ){

            while( this.utilService.isNullOrUndefined( this.completeCriteriaList ) ){
                await this.commonService.sleep( Consts.waitTime );
            }

            // CHECKME - this is a hasty fix, is there is a better way
            for( let criteria of this.completeCriteriaList ){
                criteria.count = 0;
            }

            for( let criteria of anatomicalSiteCriteriaObj ){
                for( let completeCriteria of this.completeCriteriaList ){
                    if( criteria.criteria === completeCriteria.criteria ){
                        completeCriteria.count = criteria.count;
                    }
                }
            }
        }

        this.updateCriteriaList( false );

        // Put back the checkboxes.
        // After the criteria list has been changed check the checkbox for any criteria that is in the list,
        // that was also in the criteriaListTemp list and is true in cBoxHold[] array.
        let len = this.criteriaList.length;
        for( let f0 = 0; f0 < len; f0++ ){
            this.cBox[f0] = false;
        }
        for( let f0 = 0; f0 < len; f0++ ){
            for( let f1 = 0; f1 < criteriaListTemp.length; f1++ ){
                if( criteriaListTemp[f1].criteria === this.criteriaList[f0].criteria ){
                    if( cBoxHold[f1] ){
                        this.cBox[f0] = true;
                    }
                }
            }
        }

        // Need to sort after checkboxes change.
        this.criteriaList = this.sortService.criteriaSort( this.criteriaList, this.cBox );
        this.setSequenceValue();
    }


    /**
     * Adds a 'seq' field to the criteriaList, it is the sequence which the criteria are displayed.<br>
     * This is used by the HTML when displaying only part of criteriaList.
     */
    setSequenceValue() {
        let len = this.criteriaList.length;
        let seq = 0;
        for( let f = 0; f < len; f++ ){
            this.criteriaList[f].seq = seq;
            seq++;
        }
    }

    /**
     * This is called when the component first loads, or when it needs to be 'cleared' back to its initial state, like when a new user logs in.
     */
    setInitialCriteriaList() {
        this.updateCriteriaList(true );

        // This will tell the parameter service that it can send any query criteria that where passed in the URL
        this.initMonitorService.setAtomicalSiteInit( true );
    }

    /**
     * Sets up the list of criteria and initializes it's check boxes.
     *
     * @param initCheckBox  Should all the check boxes be set to unchecked
     */
    updateCriteriaList( initCheckBox ) {

        // If we are waiting on an update due to user (re)login
        if( this.utilService.isNullOrUndefined( this.completeCriteriaList ) ){
            return;
        }

        // If this is the first time this is running just copy the data to the criteriaList
        if( this.resetFlag ){
            this.criteriaList = this.completeCriteriaList;

        }
        else{
            // This will let us keep all of the criteria, but the ones that are not included in "data" will have a count of zero.
            this.criteriaList = this.utilService.copyCriteriaObjectArray( this.completeCriteriaListHold );

            for( let f = 0; f < this.criteriaList.length; f++ ){
                this.criteriaList[f].count = 0;
            }

            for( let dataCriteria of this.completeCriteriaList ){
                for( let f = 0; f < this.criteriaList.length; f++ ){
                    if( this.criteriaList[f].criteria === dataCriteria.criteria ){
                        this.criteriaList[f].count = dataCriteria.count;
                    }
                }
            }
        }

        if( (this.resetFlag) || (initCheckBox) ){
            this.resetFlag = false;
                this.cBox = [];
                let len = this.criteriaList.length;
                for( let f = 0; f < len; f++ ){
                    this.cBox[f] = false;
                }
                this.updateCheckboxCount();
            }

        this.criteriaList = this.sortService.criteriaSort( this.criteriaList, this.cBox );
        this.criteriaListHold = this.criteriaList;

        this.setSequenceValue();
    }


    onMoreClick() {
        this.showAll = true;
    }

    onLessClick() {
        this.showAll = false;
    }


    /**
     * Called when a search criteria checkbox is checked or un checked.
     * Triggers an update of the 'Query', (re)runs the search, and sends the updated query to the query display at the top of the Search results section.
     *
     * @param i  Which checkbox
     * @param checked True if the checkbox is selected
     */
    onCheckboxClick( i, checked ) {
        // If this method was called from a URL parameter search, setHaveUserInput will be set to false by the calling method after this method returns.
        this.commonService.setHaveUserInput( true );

        this.cBox[i] = checked;
        this.updateCheckboxCount();

        let criteriaForQuery: string[] = [];

        // This category's data for the query, the 0th element is always the category name.
        criteriaForQuery.push( Consts.ANATOMICAL_SITE_CRITERIA );
        for( let f = 0; f < this.criteriaList.length; f++ ){
            if( (!this.utilService.isNullOrUndefined( this.cBox[f] )) && (this.cBox[f]) ){
                criteriaForQuery.push( this.criteriaList[f][Consts.CRITERIA] );
            }
        }

        // Tells SearchResultsTableComponent that the query has changed,
        // SearchResultsTableComponent will (re)run the query &
        // send updated query to the Query display at the top of the Search results section.
        this.commonService.updateQuery( criteriaForQuery );

        // (Re)sort the list because a checked criteria is higher than unchecked.
        this.criteriaList = this.sortService.criteriaSort( this.criteriaList, this.cBox );

        // Update the query URL
        if( this.checkedCount === 0 ){
            this.queryUrlService.clear( this.queryUrlService.ANATOMICAL_SITE );
        }
        else{
            this.sendSelectedCriteriaString();
        }
    }

    /**
     * Hides or shows this group of criteria when the arrows next to the heading are clicked.
     *
     * @param show
     */
    onShowCriteriaListClick( show: boolean ) {
        this.showCriteriaList = show;
        this.commonService.setCriteriaQueryShow( Consts.SHOW_CRITERIA_QUERY_ANATOMICAL_SITE, this.showCriteriaList );
    }

    /**
     * Clears the search text when the 'X' on the right side of the input is clicked.
     */
    onClearAnatomicalSearchInputClick() {
        this.searchHasFocus = true;
        this.searchInput = '';
        this.onSearchChange();
    }

    /**
     * When the search, within this criteria list changes, NOT the data search.
     * @NOTE This is currently commented out for Anatomical Sites
     */
    onSearchChange() {
        let tempList = [];
        let n = 0;

        for( let item of this.criteriaListHold ){
            if(
                item['criteria'].toUpperCase().includes( this.searchInput.toUpperCase() ) ||
                this.cBox[n]
            ){
                tempList.push( item );
                n++;
            }
        }
        this.criteriaList = this.sortService.criteriaSort( tempList, this.cBox );

        // This is not really needed, it is left from when I allowed the search to continue to be in effect when the text input was not visible.
        if( this.searchInput.length === 0 ){
            this.searchToolTip = 'Search';
        }
        else{
            this.searchToolTip = this.searchInput;
        }
    }

    /**
     * Toggles showing the search input box
     *
     * This is no longer used in Anatomical Site, but they may want it back some day.
     *
     * @note Clears the search text input when showSearch is switched to true
     */
    onSearchGlassClick() {
        this.showSearch = (!this.showSearch);
        if( !this.showSearch ){
            this.criteriaList = this.criteriaListHold;
            this.onClearAnatomicalSearchInputClick();
        }
    }


    onSearchTextOutFocus( n ) {
        // Text
        if( n === 0 ){
            this.searchTextHasFocus = false;
        }
        // X (Clear search text)
        if( n === 1 ){
            this.searchXHasFocus = false;
        }

        this.searchHasFocus = this.searchXHasFocus || this.searchTextHasFocus;
    }

    onSearchTextFocus( n ) {
        // Text
        if( n === 0 ){
            this.searchTextHasFocus = true;
        }
        // X (Clear search text)
        if( n === 1 ){
            this.searchXHasFocus = true;
        }
        this.searchHasFocus = true;
    }


    updateCheckboxCount() {
        let len = this.cBox.length;
        this.unCheckedCount = 0;
        this.checkedCount = 0;
        for( let f = 0; f < len; f++ ){
            if( this.cBox[f] ){
                this.checkedCount++;
            }
            else{
                this.unCheckedCount++;
            }
        }
    }


    /**
     * To reset everything to it's initial state after a new user has logged in.
     */
    resetAll() {
        this.setInitialCriteriaList();
        this.onAnatomicalSiteClearAllClick( true ); // true will keep the updateQuery from being called.
        this.updateCheckboxCount();
    }


    /**
     *
     * @param {boolean} totalClear  true = the user has cleared the complete current query - no need to rerun the query
     */
    onAnatomicalSiteClearAllClick( totalClear: boolean ) {
        this.commonService.setHaveUserInput( true );
        for( let f = 0; f < this.cBox.length; f++ ){
            this.cBox[f] = false;
        }
        this.checkedCount = 0;
        this.apiServerService.refreshCriteriaCounts();

        if( !totalClear ){
            let criteriaForQuery: string[] = [];
            criteriaForQuery.push( Consts.ANATOMICAL_SITE_CRITERIA );

            // Tells SearchResultsTableComponent that the query has changed,
            // SearchResultsTableComponent will (re)run the query &
            // send updated query to the Query display at the top of the Search results section.
            this.commonService.updateQuery( criteriaForQuery );
        }


        this.queryUrlService.clear( this.queryUrlService.ANATOMICAL_SITE );
        // Restore original criteria list and counts.
        this.completeCriteriaList = this.utilService.copyCriteriaObjectArray( this.completeCriteriaListHold );
        this.updateCriteriaList( true );
    }


    ngOnDestroy() {
        this.ngUnsubscribe.next();
        this.ngUnsubscribe.complete();
    }
}
