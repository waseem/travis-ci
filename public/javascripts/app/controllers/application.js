/*
  TODO: we need to implement before_filter for controller actions.
 */
Travis.Controllers.Application = Backbone.Controller.extend({
  routes: {
    '':                                          'recent',
    // '!/:owner':               'byOwner',
    // FIXME: I would suggest to use !/repositories/:owner/:name, to make it more rest-like.
    // Because, for instance, now we should put myRepositories on top so that it could get matched. Unambigous routes rule!
    '!/:owner/:name/L:line_number':              'repository',
    '!/:owner/:name':                            'repository',
    '!/:owner/:name/builds':                     'repositoryHistory',
    '!/:owner/:name/builds/:id/L:line_number':   'repositoryBuild',
    '!/:owner/:name/builds/:id':                 'repositoryBuild',
  },
  _queues: [ 'builds', 'rails'],
  initialize: function() {
    _.bindAll(this, 'recent', 'byUser', 'repository', 'repositoryHistory', 'repositoryBuild', 'repositoryShow', 'repositorySelected', 'buildQueued', 'buildStarted', 'buildLogged', 'buildFinished', 'buildRemoved');
  },

  run: function() {
    this.repositories = new Travis.Collections.Repositories();
    // this.builds       = new Travis.Collections.AllBuilds();
    this.workers      = new Travis.Collections.Workers();

    this.repositoriesList = new Travis.Views.Repositories.List();
    // this.repositoryShow   = new Travis.Views.Repository.Show({ parent: this });
    this.workersView      = new Travis.Views.Workers.List();

    _.each(this._queues, _.bind(function(queue_name){
      this["queue" + name ] = new Travis.Collections.Jobs([], { queue: queue_name });
      this["queueView" + name ] = new Travis.Views.Jobs.List({ queue: queue_name });
      this["queueView" + name ].attachTo(this["queue" + name])
      this["queue" + name ].fetch();
    }, this))

    $('#left #tab_recent .tab').append(this.repositoriesList.render().el);
    // $('#main').append(this.repositoryShow.render().el);

    this.repositoriesList.attachTo(this.repositories);
    // this.repositoryShow.attachTo(this.repositories)
    this.workersView.attachTo(this.workers)
    // this.repositories.bind('select', this.repositorySelected);

    this.bind('build:started',    this.buildStarted);
    this.bind('build:finished',   this.buildFinished);
    this.bind('build:configured', this.buildConfigured);
    this.bind('build:log',        this.buildLogged);
    this.bind('build:queued',     this.buildQueued);
    this.bind('build:removed',    this.buildRemoved); /* UNTESTED */

    this.repositories.fetch()
    this.workers.fetch();
  },

  // actions

  recent: function() {
    this.reset();
    this.followBuilds = true;
    this.repositories.whenFetched(_.bind(function() {
      $('#main').html(new Travis.Views.Repository.Show({ parent: this, model: this.repositories.last() }).render().el)
    }, this))
  },
  repository: function(owner, name, line_number) {
    console.log ("application#repository: ", arguments)
    this.reset();
    this.trackPage();
    this.startLoading();
    window.params = { owner: owner, name: name, line_number: line_number, action: 'repository' }

    var view = new Travis.Views.Repository.Show(
        {
          parent: this,
          model: this.repositories.synchronousFetch({ slug: owner + '/' + name }),
          tab_names: [ 'current', 'history' ]
        })
    view.render()
    view.selectTab('current')
    $('#main').html(view.el)
    this.stopLoading()
  },
  repositoryHistory: function(owner, name) {
    console.log ("application#repositoryHistory: ", arguments)
    this.reset();
    this.trackPage();
    this.selectTab('history');
    this.repositories.whenFetched(_.bind(function(repositories) {
      repositories.selectLastBy({ slug: owner + '/' + name })

    }, this));
  },
  repositoryBuild: function(owner, name, buildId, line_number) {
    console.log ("application#repositoryBuild: ", arguments)
    this.reset();
    this.trackPage();
    this.startLoading();
    window.params = { owner: owner, name: name, build_id: buildId, line_number: line_number, action: 'repositoryBuild' }
    this.buildId = parseInt(buildId);
    this.selectTab('build');
    this.repositories.whenFetched(_.bind(function(repositories) {
      repositories.selectLastBy({ slug: owner + '/' + name })

    }, this));
  },

  // helpers
  reset: function() {
    delete this.buildId;
    delete this.tab;
    this.followBuilds = false;
    window.params = {};
  },
  startLoading: function() {
    $('#main').addClass('loading')
  },
  stopLoading: function() {
    $('#main').removeClass('loading')
  },
  trackPage: function() {
    // My string opinion that this function should be embedded or chained on some
    window._gaq = _gaq || [];
    window._gaq.push(['_trackPageview']);
  },


  // internal events
  repositorySelected: function(repository) {
    repository.builds.bind('finish_get_or_fetch', function() { this.stopLoading() }.bind(this))

    switch(this.tab) {
      case 'current':
        repository.builds.select(repository.get('last_build_id'));
        break;
      case 'build':
        repository.builds.select(this.buildId);
        break;
      case 'history':
        if(!repository.builds.fetched) repository.builds.fetch();
        break;
    };
  },

  // external events

  /*
    TODO: all these things should be re-imlemented like bindings.

    These things will simply react to some change and trigger change events in some other bindings or models. They will store history of changes. Binding can be attached to the certain instance.

    Having Data-store implemented, we can even dispatch binding events to several instances (we just need to know where to attach).

    Also, we can involve some logic and create a set of rules for each binding. If this happen - do that. If upper limit have reached, trigger this, lower - that, under these circumstances one behavior under other ones - different.

    That way we could even avoid creation of so many "events". we simply create bindnings istead
   */
  buildQueued: function(data) {
    console.log ("application#buildQueued: ", arguments)
    this.addJob(data);
  },
  buildStarted: function(data) {
    console.log ("application#buildStarted: ", arguments)
    this.removeJob(data);
    this.repositories.update(data);

    if((this.followBuilds || this.tab == 'current' && this.repositories.selected().get('slug') == data.slug) && !this.buildId && !data.build.parent_id) {
      var repository = this.repositories.get(data.id);
      if(!repository.selected) repository.select();
      repository.builds.select(data.build.id);
    }
  },
  buildConfigured: function(data) {
    console.log ("application#buildConfigured: ", arguments)
    this.removeJob(data);
    this.repositories.update(data);
  },
  buildFinished: function(data) {
    console.log ("application#buildFinished: ", arguments)
    this.repositories.update(data);
  },
  buildRemoved: function(data) {
    console.log ("application#buildRemoved: ", arguments)
    this.removeJob(data);
  },
  buildLogged: function(data) {
    console.log ("application#buildLogged: ", arguments)
    this.repositories.update(data);
  },

  selectTab: function(tab) {
    this.tab = tab;
    // this.repositoryShow.activateTab(this.tab);
  },
  addJob: function(data) {
    this.jobsCollection(data).add({ number: data.build.number, id: data.build.id, repository: { slug: data.slug } });
  },
  removeJob: function(data) {
    this.jobsCollection(data).remove({ id: data.build.id });
  },
  jobsCollection: function(data) {
    return this["queue" + this.getQueueName(data)];
  },
  // TODO: that logic should be taken to a different class
  getQueueName: function (data) {
    if (data.slug && data.slug == 'rails/rails')
      return 'rails'
    return 'builds'
  }
});


function eventTest() {
  _.delay(eventTest, 20);
  console.log(1)
}

// eventTest()